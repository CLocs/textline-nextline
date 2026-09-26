import { describe, expect, it } from "vitest";
import { addDays, dailyCardsOn, lineKey, rotateCards, type DailyLine } from "../src/lib/game/dailyPick.js";
import { nextStreak } from "../src/lib/game/dailyStreak.js";

function line(titleId: string, lineIndex: number, count: number, loved = false): DailyLine {
  return { titleId, lineIndex, count, loved };
}

describe("dailyCardsOn", () => {
  const pool: DailyLine[] = [
    line("a", 1, 1, true),
    line("a", 2, 9),
    line("b", 3, 8),
    line("b", 4, 7),
    line("c", 5, 6),
    line("c", 6, 5),
    line("d", 7, 4),
    line("d", 8, 3),
  ];

  it("returns up to three cards with a loved line first when one is available", () => {
    const cards = dailyCardsOn("2026-09-01", pool);
    expect(cards.length).toBe(3);
    expect(cards[0]?.loved).toBe(true);
    expect(new Set(cards.map(lineKey)).size).toBe(3);
  });

  it("does not repeat a line inside a 7-day window", () => {
    const first = dailyCardsOn("2026-09-01", pool).map(lineKey);
    const next = dailyCardsOn("2026-09-02", pool).map(lineKey);
    expect(next.some((key) => first.includes(key))).toBe(false);
  });

  it("can reuse a line after 7 days", () => {
    const first = new Set(dailyCardsOn("2026-09-01", pool).map(lineKey));
    const later = dailyCardsOn(addDays("2026-09-01", 8), pool).map(lineKey);
    expect(later.some((key) => first.has(key))).toBe(true);
  });

  it("rotates so a tapped card is first and the rest wrap", () => {
    const cards = ["a", "b", "c"];
    expect(rotateCards(cards, 1)).toEqual(["b", "c", "a"]);
    expect(rotateCards(cards, 2)).toEqual(["c", "a", "b"]);
  });
});

describe("nextStreak", () => {
  it("starts at 1, increments on the next day, and resets after a gap", () => {
    const first = nextStreak({ lastCompletedOn: null, streak: 0 }, "2026-09-01");
    expect(first).toEqual({ lastCompletedOn: "2026-09-01", streak: 1 });
    const second = nextStreak(first, "2026-09-02");
    expect(second.streak).toBe(2);
    expect(nextStreak(second, "2026-09-02").streak).toBe(2);
    expect(nextStreak(second, "2026-09-04").streak).toBe(1);
  });
});
