import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types/content.js";
import { catalogLabel } from "../src/lib/content/libraryGroups.js";
import {
  playCountMap,
  recentFromRuns,
  summarizeRuns,
  topPlayedMovies,
  topPlayedShows,
  yourTopPlayed,
} from "../src/lib/content/playedRails.js";
import type { StoredRun } from "../src/lib/runs/api.js";

const entries: CatalogEntry[] = [
  {
    id: "baby",
    title: "Baby Driver (2017)",
    lineCount: 10,
    sourceFilename: "a.srt",
    importedAt: "",
    meta: { year: 2017 },
  },
  {
    id: "snatch",
    title: "Snatch (2000)",
    lineCount: 10,
    sourceFilename: "b.srt",
    importedAt: "",
    meta: { year: 2000 },
  },
  {
    id: "s5e1",
    title: "The Simpsons - 5x01 - Quartet",
    lineCount: 10,
    sourceFilename: "c.srt",
    importedAt: "",
    meta: { show: "The Simpsons", season: 5, episode: 1 },
  },
  {
    id: "s5e2",
    title: "The Simpsons - 5x02 - Cape Feare",
    lineCount: 10,
    sourceFilename: "d.srt",
    importedAt: "",
    meta: { show: "The Simpsons", season: 5, episode: 2 },
  },
];

function run(partial: Partial<StoredRun> & Pick<StoredRun, "id" | "titleId">): StoredRun {
  return {
    length: "mini",
    mode: "fun",
    correctCount: 8,
    wrongCount: 0,
    skipCount: 0,
    questionTotal: 10,
    endReason: "finished",
    shareId: null,
    completedAt: "2026-09-13T00:00:00.000Z",
    thumb: null,
    ...partial,
  };
}

describe("top played rails", () => {
  it("ranks movies per title and shows by grouped episode plays", () => {
    const counts = playCountMap([
      { titleId: "baby", playCount: 3 },
      { titleId: "snatch", playCount: 1 },
      { titleId: "s5e1", playCount: 2 },
      { titleId: "s5e2", playCount: 2 },
    ]);

    expect(topPlayedMovies(entries, counts).map((row) => row.entry.id)).toEqual(["baby", "snatch"]);
    expect(topPlayedShows(entries, counts)).toEqual([
      { show: "The Simpsons", playCount: 4, episodeCount: 2 },
    ]);
  });

  it("hides titles with zero plays", () => {
    const counts = playCountMap([{ titleId: "baby", playCount: 1 }]);
    expect(topPlayedMovies(entries, counts)).toHaveLength(1);
    expect(topPlayedShows(entries, counts)).toEqual([]);
  });
});

describe("recentFromRuns", () => {
  it("returns unique titles newest first", () => {
    const recent = recentFromRuns(
      [
        run({ id: "a", titleId: "baby", completedAt: "2026-09-10T00:00:00.000Z" }),
        run({ id: "b", titleId: "s5e1", completedAt: "2026-09-13T00:00:00.000Z" }),
        run({ id: "c", titleId: "baby", completedAt: "2026-09-12T00:00:00.000Z" }),
        run({ id: "d", titleId: "missing", completedAt: "2026-09-14T00:00:00.000Z" }),
      ],
      entries,
    );
    expect(recent.map((entry) => entry.id)).toEqual(["s5e1", "baby"]);
  });
});

describe("yourTopPlayed", () => {
  it("ranks personal titles by play count", () => {
    const yours = yourTopPlayed(
      [
        run({ id: "a", titleId: "baby" }),
        run({ id: "b", titleId: "s5e1" }),
        run({ id: "c", titleId: "baby" }),
        run({ id: "d", titleId: "missing" }),
      ],
      entries,
    );
    expect(yours.map((row) => [row.entry.id, row.playCount])).toEqual([
      ["baby", 2],
      ["s5e1", 1],
    ]);
  });
});

describe("summarizeRuns", () => {
  it("rolls up personal stats and most-played labels", () => {
    const stats = summarizeRuns(
      [
        run({ id: "a", titleId: "baby", correctCount: 5 }),
        run({ id: "b", titleId: "s5e1", correctCount: 8 }),
        run({ id: "c", titleId: "s5e2", correctCount: 2 }),
      ],
      entries,
    );
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.linesGuessed).toBe(15);
    expect(stats.titlesTouched).toBe(3);
    expect(stats.mostPlayed[0]).toEqual({ label: "The Simpsons", playCount: 2 });
  });
});

describe("catalogLabel", () => {
  it("prefixes show name for episodes", () => {
    expect(catalogLabel(entries[2]!)).toBe("The Simpsons · 5x01 · Quartet");
  });
});
