import { describe, expect, it } from "vitest";
import { pickInstantCards, pickVisitQuote, type DailyLine } from "../src/lib/game/dailyPick.js";
import { sampleFramedMovies } from "../src/lib/game/playNow.js";
import type { CatalogEntry } from "../src/types/content.js";

function line(titleId: string, lineIndex: number): DailyLine {
  return { titleId, lineIndex, count: 1, loved: false };
}

function movie(id: string): CatalogEntry {
  return { id, title: id, lineCount: 10, sourceFilename: `${id}.srt`, importedAt: "" };
}

describe("pickInstantCards", () => {
  it("fills from personal stars before the shared pool and skips today's lines", () => {
    const personal = [line("mine", 1), line("mine", 2)];
    const global = [line("crowd", 4), line("crowd", 5), line("today", 9)];
    const cards = pickInstantCards(personal, global, new Set(["today:9"]), () => 0);
    expect(cards.map((card) => `${card.titleId}:${card.lineIndex}`)).toEqual([
      "mine:1",
      "mine:2",
      "crowd:4",
    ]);
  });

  it("deals from the shared pool when avoiding today's lines leaves nothing", () => {
    const only = [line("crowd", 1)];
    const cards = pickInstantCards([], only, new Set(["crowd:1"]), () => 0);
    expect(cards).toEqual([expect.objectContaining({ titleId: "crowd", lineIndex: 1 })]);
  });
});

describe("pickVisitQuote", () => {
  it("uses a personal star before the shared pool", () => {
    const quote = pickVisitQuote([line("mine", 3)], [line("crowd", 8)], () => 0);
    expect(quote).toEqual(expect.objectContaining({ titleId: "mine", lineIndex: 3 }));
  });
});

describe("sampleFramedMovies", () => {
  const movies = [movie("a"), movie("b"), movie("c"), movie("d")];

  it("skips the movies just shown when others remain", () => {
    const next = sampleFramedMovies(movies, ["a", "b"], 2, () => 0);
    expect(next.map((entry) => entry.id).sort()).toEqual(["c", "d"]);
  });

  it("draws from the full list when the skip leaves fewer than two", () => {
    const next = sampleFramedMovies(movies.slice(0, 3), ["a", "b"], 2, () => 0);
    expect(next).toHaveLength(2);
  });
});
