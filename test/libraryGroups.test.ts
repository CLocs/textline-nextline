import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types/content.js";
import {
  episodeLabel,
  groupCatalogEntries,
  parseEpisodeMeta,
  stripLangSuffix,
} from "../src/lib/content/libraryGroups.js";

describe("parseEpisodeMeta", () => {
  it("parses Show - SxEE - Name", () => {
    expect(parseEpisodeMeta("The Simpsons - 5x01 - Homer's Barbershop Quartet")).toEqual({
      show: "The Simpsons",
      season: 5,
      episode: 1,
    });
  });

  it("strips .en and subtitle extensions", () => {
    expect(parseEpisodeMeta("The Simpsons - 4x01 - Kamp Krusty.en.srt")).toEqual({
      show: "The Simpsons",
      season: 4,
      episode: 1,
    });
  });

  it("returns undefined for movies", () => {
    expect(parseEpisodeMeta("Baby Driver (2017)")).toBeUndefined();
  });

  it("parses SxxExx show dumps", () => {
    expect(
      parseEpisodeMeta("It's Always Sunny in Philadelphia - S10E01 - The Gang Beats Boggs.en.srt"),
    ).toEqual({
      show: "It's Always Sunny in Philadelphia",
      season: 10,
      episode: 1,
    });
  });
});

describe("stripLangSuffix", () => {
  it("removes trailing .en", () => {
    expect(stripLangSuffix("Kamp Krusty.en")).toBe("Kamp Krusty");
  });
});

describe("groupCatalogEntries", () => {
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
      id: "s4e1",
      title: "The Simpsons - 4x01 - Kamp Krusty.en",
      lineCount: 10,
      sourceFilename: "b.srt",
      importedAt: "",
      meta: { show: "The Simpsons", season: 4, episode: 1 },
    },
    {
      id: "s5e2",
      title: "The Simpsons - 5x02 - Cape Feare",
      lineCount: 10,
      sourceFilename: "c.srt",
      importedAt: "",
      meta: { show: "The Simpsons", season: 5, episode: 2 },
    },
    {
      id: "s5e1",
      title: "The Simpsons - 5x01 - Quartet",
      lineCount: 10,
      sourceFilename: "d.srt",
      importedAt: "",
      meta: { show: "The Simpsons", season: 5, episode: 1 },
    },
  ];

  it("splits movies and nests shows by season", () => {
    const groups = groupCatalogEntries(entries);
    expect(groups.movies.map((e) => e.id)).toEqual(["baby"]);
    expect(groups.shows).toHaveLength(1);
    expect(groups.shows[0]?.show).toBe("The Simpsons");
    expect(groups.shows[0]?.episodeCount).toBe(3);
    expect(groups.shows[0]?.seasons.get(5)?.map((e) => e.id)).toEqual(["s5e1", "s5e2"]);
  });
});

describe("episodeLabel", () => {
  it("formats code and cleaned episode name", () => {
    expect(
      episodeLabel({
        id: "x",
        title: "The Simpsons - 4x01 - Kamp Krusty.en",
        lineCount: 1,
        sourceFilename: "",
        importedAt: "",
        meta: { show: "The Simpsons", season: 4, episode: 1 },
      }),
    ).toBe("4x01 · Kamp Krusty");
  });
});
