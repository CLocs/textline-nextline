import { describe, expect, it } from "vitest";
import type { CatalogEntry, Title } from "../src/types/content.js";
import {
  popularKey,
  searchCatalog,
  tokenizeQuery,
} from "../src/lib/content/globalSearch.js";

function entry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "title">): CatalogEntry {
  return {
    lineCount: 3,
    sourceFilename: `${partial.id}.srt`,
    importedAt: "2024-01-01",
    ...partial,
  };
}

function title(id: string, name: string, texts: string[]): Title {
  return {
    id,
    title: name,
    sourceFilename: `${id}.srt`,
    importedAt: "2024-01-01",
    lineCount: texts.length,
    lines: texts.map((text, index) => ({
      index,
      text,
      kind: "dialogue" as const,
      startMs: index * 1000,
      endMs: index * 1000 + 900,
    })),
  };
}

const entries: CatalogEntry[] = [
  entry({ id: "oceans", title: "Ocean's Thirteen (2007)", meta: { year: 2007 } }),
  entry({
    id: "homer",
    title: "The Simpsons - 4x03 - Homer the Heretic.en",
    meta: { show: "The Simpsons", season: 4, episode: 3 },
  }),
];

const titles: Record<string, Title> = {
  oceans: title("oceans", "Ocean's Thirteen (2007)", [
    "Let 'em watch.",
    "We should go.",
    "Something else entirely.",
  ]),
  homer: title("homer", "The Simpsons - 4x03 - Homer the Heretic.en", [
    "I'm not going.",
    "Church is boring.",
    "Let 'em watch the game.",
  ]),
};

function resolveTitle(id: string) {
  return titles[id];
}

describe("tokenizeQuery", () => {
  it("normalizes punctuation and case", () => {
    expect(tokenizeQuery("  Let 'em  WATCH! ")).toEqual(["let", "'em", "watch"]);
  });
});

describe("searchCatalog", () => {
  it("matches titles and lines", () => {
    const result = searchCatalog({
      query: "ocean",
      mode: "popular",
      entries,
      resolveTitle,
    });
    expect(result.titles.map((hit) => hit.titleId)).toEqual(["oceans"]);
    expect(result.lines).toEqual([]);
  });

  it("finds lines across titles and ranks by popular counts", () => {
    const popularCounts = new Map<string, number>([
      [popularKey("homer", 2), 5],
      [popularKey("oceans", 0), 2],
    ]);
    const result = searchCatalog({
      query: "let em watch",
      mode: "popular",
      entries,
      resolveTitle,
      popularCounts,
    });
    expect(result.lines.map((hit) => `${hit.titleId}:${hit.lineIndex}`)).toEqual([
      "homer:2",
      "oceans:0",
    ]);
  });

  it("filters to starred lines in mine mode", () => {
    const result = searchCatalog({
      query: "watch",
      mode: "mine",
      entries,
      resolveTitle,
      isStarred: (titleId, lineIndex) => titleId === "oceans" && lineIndex === 0,
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ titleId: "oceans", lineIndex: 0, starred: true });
  });

  it("browses popular lines when the query is empty", () => {
    const popularCounts = new Map<string, number>([[popularKey("oceans", 0), 9]]);
    const result = searchCatalog({
      query: "",
      mode: "popular",
      entries,
      resolveTitle,
      popularCounts,
    });
    expect(result.titles).toEqual([]);
    expect(result.lines).toEqual([
      expect.objectContaining({
        titleId: "oceans",
        lineIndex: 0,
        text: "Let 'em watch.",
        popularCount: 9,
      }),
    ]);
  });
});
