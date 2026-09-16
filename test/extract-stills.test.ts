import { describe, expect, it } from "vitest";
import {
  ffmpegExtractArgs,
  ffmpegRemuxArgs,
  mediaRemuxOutput,
  offsetMsForTitle,
  parseLineIndices,
  resolveCue,
  seekSeconds,
  stillFileName,
  timeScaleForTitle,
} from "../src/lib/content/extractStills.js";
import type { Title } from "../src/types/content.js";

describe("parseLineIndices", () => {
  it("splits comma lists and drops duplicates", () => {
    expect(parseLineIndices("0,41,328,763,1336")).toEqual([0, 41, 328, 763, 1336]);
    expect(parseLineIndices("0, 0, 41")).toEqual([0, 41]);
  });

  it("rejects empty or non-numeric tokens", () => {
    expect(() => parseLineIndices("")).toThrow(/at least one/);
    expect(() => parseLineIndices("41,-1")).toThrow(/Invalid line index/);
  });
});

describe("seekSeconds", () => {
  it("adds offset to startMs", () => {
    expect(seekSeconds(38122, 0)).toBe(38.122);
    expect(seekSeconds(38122, 1200)).toBe(39.322);
  });

  it("applies PAL timeScale before offset", () => {
    expect(seekSeconds(6975136, 0, 24 / 25)).toBeCloseTo(6696.13056, 5);
  });
});

describe("timeScaleForTitle", () => {
  it("defaults to 1", () => {
    expect(timeScaleForTitle({}, "oceans-thirteen-2007")).toBe(1);
    expect(
      timeScaleForTitle({ "oceans-thirteen-2007": { offsetMs: 0, timeScale: 0.96 } }, "oceans-thirteen-2007"),
    ).toBe(0.96);
  });
});

describe("stillFileName", () => {
  it("names by line index", () => {
    expect(stillFileName(41)).toBe("41.jpg");
  });
});

describe("offsetMsForTitle", () => {
  it("defaults to 0 when the title is missing", () => {
    expect(offsetMsForTitle({}, "oceans-thirteen-2007")).toBe(0);
    expect(offsetMsForTitle({ "oceans-thirteen-2007": { offsetMs: -400 } }, "oceans-thirteen-2007")).toBe(
      -400,
    );
  });
});

describe("resolveCue", () => {
  const title: Title = {
    id: "oceans-thirteen-2007",
    title: "Oceans Thirteen (2007)",
    sourceFilename: "x.srt",
    importedAt: "2026-01-01T00:00:00.000Z",
    lineCount: 1,
    lines: [{ index: 0, text: "Valencia, CA 2:43 am", kind: "dialogue", startMs: 38122, endMs: 42293 }],
  };

  it("returns the matching line", () => {
    expect(resolveCue(title, 0).startMs).toBe(38122);
  });

  it("throws when the index is missing", () => {
    expect(() => resolveCue(title, 99)).toThrow(/No line 99/);
  });
});

describe("ffmpegExtractArgs", () => {
  it("uses a short accurate output seek after a coarse input seek", () => {
    const args = ffmpegExtractArgs({
      input: "inbox/media/oceans-thirteen-2007.mkv",
      seekSec: 38.122,
      output: "inbox/stills-preview/oceans-thirteen-2007/0.jpg",
    });
    expect(args).toContain("-i");
    const i = args.indexOf("-i");
    expect(args[i - 2]).toBe("-ss");
    expect(args[i + 2]).toBe("-ss");
    expect(args).toContain("scale=1280:-1");
    expect(args).toContain("-frames:v");
  });
});

describe("ffmpegRemuxArgs", () => {
  it("copies streams with generated PTS", () => {
    const args = ffmpegRemuxArgs({
      input: "G:/videos/movies/Ocean's 13 (2007).avi",
      output: "inbox/media/oceans-thirteen-2007.mkv",
    });
    expect(args).toContain("+genpts");
    expect(args.indexOf("-c")).toBeLessThan(args.indexOf("copy"));
    expect(args.at(-1)).toBe("inbox/media/oceans-thirteen-2007.mkv");
  });
});

describe("mediaRemuxOutput", () => {
  it("names the mkv after the title id", () => {
    expect(mediaRemuxOutput("/repo", "the-empire-strikes-back-1980").replaceAll("\\", "/")).toBe(
      "/repo/inbox/media/the-empire-strikes-back-1980.mkv",
    );
  });

  it("rejects junk title ids", () => {
    expect(() => mediaRemuxOutput("/repo", "../etc")).toThrow(/Invalid title id/);
  });
});
