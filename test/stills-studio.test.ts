import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { pickHandfulIndices } from "../src/lib/content/stillsHandful.js";
import {
  buildShowQueue,
  durationPastEof,
  episodeStatus,
  listPreviewStillIndices,
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
});

describe("episodeStatus", () => {
  it("orders pushed over batched over review", () => {
    expect(episodeStatus({ hasFile: true, stillCount: 10, handful: [1], pushedAt: "x" })).toBe("pushed");
    expect(episodeStatus({ hasFile: true, stillCount: 10, handful: [1], batchedAt: "x" })).toBe("batched");
    expect(episodeStatus({ hasFile: true, stillCount: 6, handful: [1, 2] })).toBe("review");
    expect(episodeStatus({ hasFile: true, stillCount: 0, handful: [] })).toBe("ready");
    expect(episodeStatus({ hasFile: false, stillCount: 0, handful: [] })).toBe("no-file");
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
