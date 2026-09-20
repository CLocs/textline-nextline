import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types/content.js";
import {
  matchShowVideoToCatalog,
  parseShowVideoFilename,
} from "../src/lib/content/showMedia.js";

describe("parseShowVideoFilename", () => {
  it("reads leading SxxExx Simpsons rips", () => {
    expect(
      parseShowVideoFilename("S04E01 - The Simpsons - Kamp Krusty (English).Avi"),
    ).toEqual({
      name: "S04E01 - The Simpsons - Kamp Krusty (English).Avi",
      season: 4,
      episode: 1,
      showHint: "The Simpsons",
      episodeTitle: "Kamp Krusty",
    });
  });

  it("reads Show - NxNN - Name", () => {
    expect(parseShowVideoFilename("The Simpsons - 4x03 - Homer the Heretic.mkv")).toMatchObject({
      season: 4,
      episode: 3,
      showHint: "The Simpsons",
      episodeTitle: "Homer the Heretic",
    });
  });
});

describe("matchShowVideoToCatalog", () => {
  const entries: CatalogEntry[] = [
    {
      id: "the-simpsons---4x01---kamp-krustyen",
      title: "The Simpsons - 4x01 - Kamp Krusty.en",
      lineCount: 10,
      sourceFilename: "a.srt",
      importedAt: "",
      meta: { show: "The Simpsons", season: 4, episode: 1 },
    },
    {
      id: "the-simpsons---4x03---homer-the-hereticen",
      title: "The Simpsons - 4x03 - Homer the Heretic.en",
      lineCount: 10,
      sourceFilename: "b.srt",
      importedAt: "",
      meta: { show: "The Simpsons", season: 4, episode: 3 },
    },
  ];

  it("pins S04E01 to Kamp Krusty", () => {
    const hint = parseShowVideoFilename("S04E01 - The Simpsons - Kamp Krusty (English).Avi")!;
    expect(matchShowVideoToCatalog(hint, entries, "The Simpsons")?.id).toBe(
      "the-simpsons---4x01---kamp-krustyen",
    );
  });
});
