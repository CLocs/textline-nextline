import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types/content.js";
import { scanStillsPreview } from "../src/lib/content/mediaUploads.js";
import {
  coverStillForEntries,
  coverStillForShow,
  coverStillLineIndex,
} from "../src/lib/content/stillsCover.js";
import type { ShowGroup } from "../src/lib/content/libraryGroups.js";

function entry(id: string): CatalogEntry {
  return {
    id,
    title: id,
    lineCount: 10,
    sourceFilename: "x.srt",
    importedAt: "",
  };
}

describe("coverStillLineIndex", () => {
  it("returns the lowest still index for a covered title", () => {
    expect(coverStillLineIndex("oceans-thirteen-2007")).toBe(0);
    expect(coverStillLineIndex("the-wolf-of-wall-street-2013")).toBe(27);
  });

  it("returns undefined when the title has no cover", () => {
    expect(coverStillLineIndex("sample-episode")).toBeUndefined();
    expect(coverStillLineIndex("the-simpsons---5x01---homers-barbershop-quartet")).toBeUndefined();
  });
});

describe("coverStillForEntries", () => {
  it("picks the first entry that has a cover", () => {
    const hit = coverStillForEntries([
      entry("sample-episode"),
      entry("inglourious-basterds-2009"),
    ]);
    expect(hit).toEqual({ titleId: "inglourious-basterds-2009", lineIndex: 3 });
  });
});

describe("coverStillForShow", () => {
  it("walks seasons in order", () => {
    const show: ShowGroup = {
      kind: "show",
      show: "Test",
      episodeCount: 2,
      seasons: new Map([
        [2, [entry("oceans-thirteen-2007")]],
        [1, [entry("sample-episode")]],
      ]),
    };
    expect(coverStillForShow(show)).toEqual({
      titleId: "oceans-thirteen-2007",
      lineIndex: 0,
    });
  });
});

describe("scanStillsPreview", () => {
  it("counts jpegs and uses the lowest line index as the cover", () => {
    const root = mkdtempSync(join(tmpdir(), "stills-preview-"));
    const folder = join(root, "oceans-thirteen-2007");
    mkdirSync(folder);
    writeFileSync(join(folder, "40.jpg"), "");
    writeFileSync(join(folder, "8.jpg"), "");
    writeFileSync(join(folder, "readme.txt"), "");
    expect(scanStillsPreview(root)).toEqual({
      titles: { "oceans-thirteen-2007": 2 },
      covers: { "oceans-thirteen-2007": 8 },
    });
  });

  it("returns empty maps when the folder is missing", () => {
    expect(scanStillsPreview(join(tmpdir(), "no-such-stills-preview"))).toEqual({
      titles: {},
      covers: {},
    });
  });
});
