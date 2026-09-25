import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../src/lib/content/csv.js";
import {
  formatQueueMarkdown,
  loadQueueFromDir,
  markFilmsImported,
  mergeQueue,
  parseLikesCsv,
  parseRatingsCsv,
  priorityRank,
  seedFromExport,
  sortQueueByPriority,
} from "../src/lib/content/letterboxdQueue.js";
import type { QueueFilm } from "../src/types/contentQueue.js";

const fixtureDir = join(import.meta.dirname, "fixtures", "letterboxd");
const deltaDir = join(import.meta.dirname, "fixtures", "letterboxd-delta");

function film(partial: Partial<QueueFilm> & Pick<QueueFilm, "letterboxdUri" | "title">): QueueFilm {
  return {
    year: 2000,
    liked: false,
    rating: null,
    priority: 5,
    playCount: 0,
    highlightCount: 0,
    tmdbId: null,
    srt: "missing",
    converted: false,
    imported: false,
    ...partial,
  };
}

describe("parseCsv", () => {
  it("handles quoted commas and a BOM", () => {
    const rows = parseCsv('\uFEFFName,Year\n"The Good, the Bad and the Ugly",1966\n');
    expect(rows).toEqual([{ Name: "The Good, the Bad and the Ugly", Year: "1966" }]);
  });
});

describe("seedFromExport", () => {
  it("unions likes with ratings ≥ 4.5 and drops a 4.0", () => {
    const likes = parseLikesCsv(
      readFileSync(join(fixtureDir, "likes", "films.csv"), "utf8"),
    );
    const ratings = parseRatingsCsv(
      readFileSync(join(fixtureDir, "ratings.csv"), "utf8"),
    );
    const films = seedFromExport(likes, ratings);
    const uris = films.map((f) => f.letterboxdUri).sort();

    expect(uris).toEqual([
      "https://boxd.it/escape",
      "https://boxd.it/fourfive",
      "https://boxd.it/high",
      "https://boxd.it/likedonly",
      "https://boxd.it/overlap",
    ]);
    expect(films.find((f) => f.letterboxdUri.endsWith("/okay"))).toBeUndefined();

    const escape = films.find((f) => f.letterboxdUri.endsWith("/escape"))!;
    expect(escape.liked).toBe(true);
    expect(escape.rating).toBe(5);
    expect(escape.priority).toBe(1);

    const overlap = films.find((f) => f.letterboxdUri.endsWith("/overlap"))!;
    expect(overlap.title).toBe("The Good, the Bad and the Ugly");
    expect(overlap.liked).toBe(true);
    expect(overlap.rating).toBe(4.5);
    expect(overlap.priority).toBe(3);
  });
});

describe("priorityRank", () => {
  it("puts 5★ likes first and unrated likes last", () => {
    expect(priorityRank(true, 5)).toBe(1);
    expect(priorityRank(false, 5)).toBe(2);
    expect(priorityRank(true, 4.5)).toBe(3);
    expect(priorityRank(false, 4.5)).toBe(4);
    expect(priorityRank(true, null)).toBe(5);
  });
});

describe("loadQueueFromDir + merge", () => {
  it("reads a Letterboxd folder layout", () => {
    const { incoming, stats } = loadQueueFromDir(fixtureDir);
    expect(stats.liked).toBe(3);
    expect(stats.highRated).toBe(4);
    expect(stats.unique).toBe(5);
    expect(incoming).toHaveLength(5);
    expect(incoming.find((f) => f.title === "The Great Escape")?.playCount).toBe(2);
    expect(incoming.find((f) => f.title === "High Rated")?.playCount).toBe(1);
    expect(incoming.find((f) => f.title === "Liked Only")?.playCount).toBe(0);
  });

  it("ignores empty diary.csv under orphaned/", () => {
    const { incoming } = loadQueueFromDir(fixtureDir);
    expect(incoming.find((f) => f.title === "The Great Escape")?.playCount).toBe(2);
  });

  it("appends new likes and preserves srt / converted / imported / tmdbId", () => {
    const first = loadQueueFromDir(fixtureDir).incoming;
    first[0] = {
      ...first[0]!,
      tmdbId: 5925,
      srt: "manual",
      converted: true,
      imported: true,
    };

    const second = loadQueueFromDir(deltaDir).incoming;
    const { films, newCount } = mergeQueue(first, second);

    expect(newCount).toBe(1);
    expect(films).toHaveLength(6);
    const kept = films.find((f) => f.letterboxdUri === first[0]!.letterboxdUri)!;
    expect(kept.tmdbId).toBe(5925);
    expect(kept.srt).toBe("manual");
    expect(kept.converted).toBe(true);
    expect(kept.imported).toBe(true);
    expect(films.some((f) => f.letterboxdUri.endsWith("/newlike"))).toBe(true);
  });
});

describe("sortQueueByPriority", () => {
  it("orders 5★ likes before 4.5s", () => {
    const sorted = sortQueueByPriority([
      film({ title: "B", letterboxdUri: "b", liked: true, rating: 4.5, priority: 3 }),
      film({ title: "A", letterboxdUri: "a", liked: true, rating: 5, priority: 1 }),
    ]);
    expect(sorted.map((f) => f.title)).toEqual(["A", "B"]);
  });

  it("within the same priority, higher play count wins over alphabetical", () => {
    const sorted = sortQueueByPriority([
      film({ title: "Alpha", letterboxdUri: "a", liked: true, rating: 5, priority: 1, playCount: 1 }),
      film({ title: "Zulu", letterboxdUri: "z", liked: true, rating: 5, priority: 1, playCount: 4 }),
    ]);
    expect(sorted.map((f) => f.title)).toEqual(["Zulu", "Alpha"]);
  });
});

describe("markFilmsImported", () => {
  it("flags a queue row when a catalog title matches", () => {
    const films = [
      film({
        title: "The Matrix",
        year: 1999,
        letterboxdUri: "https://boxd.it/matrix",
        liked: true,
        rating: 5,
        priority: 1,
      }),
    ];
    const n = markFilmsImported(films, [{ title: "Matrix (1999)", year: 1999, lineCount: 1400 }]);
    expect(n).toBe(1);
    expect(films[0]?.imported).toBe(true);
    expect(films[0]?.srt).toBe("manual");
  });

  it("flags a thin subtitle file as short", () => {
    const films = [
      film({
        title: "Django Unchained",
        year: 2012,
        letterboxdUri: "https://boxd.it/django",
        liked: true,
        rating: 5,
        priority: 1,
      }),
    ];
    markFilmsImported(films, [{ title: "Django Unchained", year: 2012, lineCount: 366 }]);
    expect(films[0]?.srt).toBe("short");
    markFilmsImported(films, [{ title: "Django Unchained", year: 2012, lineCount: 1859 }]);
    expect(films[0]?.srt).toBe("manual");
  });
});

describe("formatQueueMarkdown", () => {
  it("includes a header and a row per film", () => {
    const md = formatQueueMarkdown([
      film({ title: "The Great Escape", year: 1963, letterboxdUri: "https://boxd.it/escape", liked: true, rating: 5, priority: 1 }),
    ]);
    expect(md).toContain("The Great Escape");
    expect(md).toContain("https://boxd.it/escape");
    expect(md).toContain("| Pri | Plays | HLs |");
    expect(md).toContain("[ ] missing");
  });

  it("checks off downloaded SRTs and labels short files", () => {
    const md = formatQueueMarkdown([
      film({
        title: "The Gentlemen",
        year: 2019,
        letterboxdUri: "https://boxd.it/gents",
        liked: true,
        rating: 5,
        priority: 1,
        srt: "manual",
      }),
      film({
        title: "Django Unchained",
        year: 2012,
        letterboxdUri: "https://boxd.it/django",
        liked: true,
        rating: 5,
        priority: 1,
        srt: "short",
      }),
    ]);
    expect(md).toContain("| [x] |");
    expect(md).toContain("[x] short");
  });

  it("appends hand-queued shows", () => {
    const md = formatQueueMarkdown([], [
      {
        title: "SpongeBob SquarePants",
        season: 1,
        year: 1999,
        srt: "missing",
        note: "Season 1",
      },
    ]);
    expect(md).toContain("## Shows");
    expect(md).toContain("SpongeBob SquarePants");
    expect(md).toContain("| 1 | 1999 |");
  });
});
