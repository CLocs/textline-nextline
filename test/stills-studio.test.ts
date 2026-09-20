import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { pickHandfulIndices, shuffleHandfulIndices } from "../src/lib/content/stillsHandful.js";
import {
  buildShowQueue,
  durationPastEof,
  episodeStatus,
  listPreviewStillIndices,
  mergeSyncEntry,
  parseFrameRate,
  STUDIO_SKIP_TITLE_IDS,
  videoDirForShow,
} from "../src/lib/content/stillsStudio.js";

function line(index: number, text: string) {
  return { index, text, kind: "dialogue" as const, startMs: index * 1000, endMs: index * 1000 + 500 };
}

const title: Title = {
  id: "ep",
  title: "The Simpsons - 4x03 - Homer the Heretic",
  sourceFilename: "x.srt",
  importedAt: "2026-01-01T00:00:00.000Z",
  lineCount: 12,
  lines: Array.from({ length: 12 }, (_, i) =>
    line(i, i % 2 === 0 ? `Distinctive dialogue line number ${i} here` : "ok"),
  ),
};

describe("pickHandfulIndices", () => {
  it("spreads six starred lines", () => {
    expect(pickHandfulIndices(title, [0, 2, 4, 6, 8, 10])).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("fills from distinctive dialogue when stars are scarce", () => {
    const picked = pickHandfulIndices(title, [2]);
    expect(picked).toContain(2);
    expect(picked).toHaveLength(6);
  });

  it("picks six distinctive cues when there are no stars", () => {
    expect(pickHandfulIndices(title, [])).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("skips opening and closing cues when there are enough lines", () => {
    const long: Title = {
      ...title,
      lineCount: 40,
      lines: Array.from({ length: 40 }, (_, i) =>
        line(i, `Distinctive dialogue line number ${i} here`),
      ),
    };
    const picked = pickHandfulIndices(long, []);
    expect(picked).toHaveLength(6);
    expect(picked[0]).toBeGreaterThan(0);
    expect(picked[picked.length - 1]!).toBeLessThan(39);
  });

  it("shuffles a different inner six", () => {
    const long: Title = {
      ...title,
      lineCount: 40,
      lines: Array.from({ length: 40 }, (_, i) =>
        line(i, `Distinctive dialogue line number ${i} here`),
      ),
    };
    const first = pickHandfulIndices(long, []);
    let n = 0;
    const rng = () => {
      n += 1;
      return (n * 0.37) % 1;
    };
    const shuffled = shuffleHandfulIndices(long, [], first, rng);
    expect(shuffled).toHaveLength(6);
    expect(shuffled[0]).toBeGreaterThan(0);
    expect(shuffled.join(",")).not.toBe(first.join(","));
  });

  it("skips theme chorus and subtitle-site junk", () => {
    const noisy: Title = {
      ...title,
      lineCount: 20,
      lines: [
        line(0, "[Chorus] ## The Simpsons ##"),
        ...Array.from({ length: 16 }, (_, i) => line(i + 1, `Distinctive dialogue line number ${i + 1} here`)),
        line(17, "[ People Chattering ] Shh! www.tvsubtitles.net"),
        line(18, "ok"),
        line(19, "ok"),
      ],
    };
    const picked = pickHandfulIndices(noisy, []);
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain(0);
    expect(picked).not.toContain(17);
  });
});

describe("episodeStatus", () => {
  it("orders pushed over batched over review", () => {
    expect(episodeStatus({ hasFile: true, stillCount: 10, handful: [1], pushedAt: "x" })).toBe("pushed");
    expect(episodeStatus({ hasFile: true, stillCount: 10, handful: [1], batchedAt: "x" })).toBe("batched");
    expect(episodeStatus({ hasFile: true, stillCount: 6, handful: [1, 2] })).toBe("review");
    expect(episodeStatus({ hasFile: true, stillCount: 6, handful: [] })).toBe("review");
    expect(episodeStatus({ hasFile: true, stillCount: 0, handful: [] })).toBe("ready");
    expect(episodeStatus({ hasFile: false, stillCount: 0, handful: [] })).toBe("no-file");
  });
});

describe("mergeSyncEntry", () => {
  it("drops batch timestamps so a handful retry can leave gallery", () => {
    const merged = mergeSyncEntry(
      { offsetMs: 0, batchedAt: "b", approvedAt: "a", pushedAt: "p" },
      { offsetMs: -1000, batchedAt: undefined, approvedAt: undefined, pushedAt: undefined },
    );
    const written = JSON.parse(JSON.stringify(merged)) as Record<string, unknown>;
    expect(written.offsetMs).toBe(-1000);
    expect(written.batchedAt).toBeUndefined();
    expect(written.approvedAt).toBeUndefined();
    expect(written.pushedAt).toBeUndefined();
  });
});

describe("durationPastEof", () => {
  it("warns when the last cue seeks past the remux", () => {
    expect(durationPastEof(1_300_000, 1200, -57_000)).toBe(true);
    expect(durationPastEof(1_300_000, 1300, -57_000)).toBe(false);
  });
});

describe("videoDirForShow", () => {
  it("maps The Simpsons to the local rip folder", () => {
    expect(videoDirForShow("The Simpsons").replaceAll("\\", "/")).toBe("G:/videos/shows/Simpsons");
  });

  it("maps Movies to the local movie folder", () => {
    expect(videoDirForShow("Movies").replaceAll("\\", "/")).toBe("G:/videos/movies");
  });
});

describe("buildShowQueue", () => {
  it("skips Kamp Krusty and Streetcar", () => {
    const queue = buildShowQueue({
      show: "The Simpsons",
      directory: "/missing",
      entries: [
        {
          id: "the-simpsons---4x01---kamp-krustyen",
          title: "The Simpsons - 4x01 - Kamp Krusty.en",
          lineCount: 10,
          sourceFilename: "a",
          importedAt: "",
          meta: { show: "The Simpsons", season: 4, episode: 1 },
        },
        {
          id: "the-simpsons---4x03---homer-the-hereticen",
          title: "The Simpsons - 4x03 - Homer the Heretic.en",
          lineCount: 10,
          sourceFilename: "b",
          importedAt: "",
          meta: { show: "The Simpsons", season: 4, episode: 3 },
        },
      ],
      titlesById: new Map(),
      sync: {},
      stillCounts: {},
      starCounts: {},
    });
    expect(STUDIO_SKIP_TITLE_IDS).toContain("the-simpsons---4x01---kamp-krustyen");
    expect(STUDIO_SKIP_TITLE_IDS).toContain("the-simpsons---4x02---a-streetcar-named-margeen");
    expect(queue.episodes.map((ep) => ep.titleId)).toEqual(["the-simpsons---4x03---homer-the-hereticen"]);
    expect(queue.episodes[0]?.status).toBe("no-file");
    expect(queue.episodes[0]?.offsetMs).toBe(-57000);
  });

  it("lists movies with stills even when the video folder is missing", () => {
    const queue = buildShowQueue({
      show: "Movies",
      directory: "/missing-movies",
      entries: [
        {
          id: "payback-1999",
          title: "Payback (1999)",
          lineCount: 906,
          sourceFilename: "payback.srt",
          importedAt: "",
          meta: { year: 1999 },
        },
      ],
      titlesById: new Map(),
      sync: {
        "payback-1999": { offsetMs: 0, durationSec: 6081, handful: [77, 187] },
      },
      stillCounts: { "payback-1999": 6 },
      starCounts: { "payback-1999": 78 },
    });
    expect(queue.episodes.map((ep) => ep.titleId)).toEqual(["payback-1999"]);
    expect(queue.episodes[0]?.status).toBe("no-file");
    expect(queue.episodes[0]?.offsetMs).toBe(0);
  });
});

describe("listPreviewStillIndices", () => {
  it("lists jpeg line indices in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "stills-preview-idx-"));
    writeFileSync(join(dir, "88.jpg"), "");
    writeFileSync(join(dir, "25.jpg"), "");
    writeFileSync(join(dir, "readme.txt"), "");
    expect(listPreviewStillIndices(dir)).toEqual([25, 88]);
  });
});

describe("parseFrameRate", () => {
  it("parses ntsc and pal probe strings", () => {
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseFrameRate("25/1")).toBe(25);
  });
});

describe("studio R2 push job", () => {
  it("rejects invalid title ids before starting a wrangler upload", async () => {
    const { createStudioContext, startStudioPush, studioPushStatus } = await import(
      "../src/lib/content/stillsStudioActions.js"
    );
    expect(studioPushStatus()?.status === "running").toBe(false);
    expect(() => startStudioPush(createStudioContext(process.cwd()), "Nope!!")).toThrow(/Invalid title id/);
  });
});
