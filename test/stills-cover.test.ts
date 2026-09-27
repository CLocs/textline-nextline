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
  pickCoverLineIndex,
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

const covers = {
  "oceans-thirteen-2007": 0,
  "the-wolf-of-wall-street-2013": 27,
  "inglourious-basterds-2009": 3,
};

describe("pickCoverLineIndex", () => {
  it("prefers the earliest starred scene that has a JPEG", () => {
    expect(pickCoverLineIndex([0, 1, 27, 40], [27, 40])).toBe(27);
    expect(pickCoverLineIndex([0, 34, 100], [34, 100])).toBe(34);
  });

  it("falls back to the lowest JPEG when no starred scene is on disk", () => {
    expect(pickCoverLineIndex([4, 1, 9], [27])).toBe(1);
    expect(pickCoverLineIndex([8, 40], [])).toBe(8);
  });
});

describe("coverStillLineIndex", () => {
  it("returns the lowest still index for a covered title", () => {
    expect(coverStillLineIndex("oceans-thirteen-2007", covers, {})).toBe(0);
    expect(coverStillLineIndex("the-wolf-of-wall-street-2013", covers, {})).toBe(27);
  });

  it("uses the earliest starred scene instead of an opening-frame cover", () => {
    expect(
      coverStillLineIndex(
        "the-wolf-of-wall-street-2013",
        { "the-wolf-of-wall-street-2013": 0 },
        { "the-wolf-of-wall-street-2013": [27, 40] },
      ),
    ).toBe(27);
    expect(
      coverStillLineIndex(
        "matrix-1999",
        { "matrix-1999": 0 },
        { "matrix-1999": [34, 100] },
      ),
    ).toBe(34);
  });

  it("returns undefined when the title has no cover", () => {
    expect(coverStillLineIndex("sample-episode", covers, {})).toBeUndefined();
    expect(coverStillLineIndex("the-simpsons---5x01---homers-barbershop-quartet", covers, {})).toBeUndefined();
  });
});

describe("coverStillForEntries", () => {
  it("picks the first entry that has a cover", () => {
    const hit = coverStillForEntries(
      [entry("sample-episode"), entry("inglourious-basterds-2009")],
      covers,
      {},
    );
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
    expect(coverStillForShow(show, covers, {})).toEqual({
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
    expect(scanStillsPreview(root, {})).toEqual({
      titles: { "oceans-thirteen-2007": 2 },
      covers: { "oceans-thirteen-2007": 8 },
    });
  });

  it("keeps the earliest starred scene when an opening frame is also on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "stills-preview-"));
    const folder = join(root, "matrix-1999");
    mkdirSync(folder);
    writeFileSync(join(folder, "0.jpg"), "");
    writeFileSync(join(folder, "34.jpg"), "");
    writeFileSync(join(folder, "100.jpg"), "");
    expect(scanStillsPreview(root, { "matrix-1999": [34, 100] }).covers).toEqual({
      "matrix-1999": 34,
    });
  });

  it("returns empty maps when the folder is missing", () => {
    expect(scanStillsPreview(join(tmpdir(), "no-such-stills-preview"))).toEqual({
      titles: {},
      covers: {},
    });
  });
});
