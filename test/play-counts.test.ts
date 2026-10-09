import { describe, expect, it } from "vitest";
import { isPerfectLine, parseDailyScore, playCounts } from "../api/src/playCounts.js";

const perfectMini = {
  length: "mini",
  correctCount: 10,
  wrongCount: 0,
  skipCount: 0,
  questionTotal: 10,
};

describe("playCounts", () => {
  it("counts minis apart from full games and weights perfects by correct answers", () => {
    const counts = playCounts({
      runs: [
        perfectMini,
        { length: "mini", correctCount: 3, wrongCount: 0, skipCount: 0, questionTotal: 3 },
        { length: "mini", correctCount: 8, wrongCount: 1, skipCount: 0, questionTotal: 10 },
        { length: "full", correctCount: 40, wrongCount: 0, skipCount: 0, questionTotal: 40 },
      ],
      dailies: [
        { correctCount: 3, wrongCount: 0, skipCount: 0, questionTotal: 3 },
        { correctCount: 2, wrongCount: 1, skipCount: 0, questionTotal: 3 },
      ],
      dmsCorrect: 4,
    });

    expect(counts.minisPlayed).toBe(3);
    expect(counts.dailiesPlayed).toBe(2);
    expect(counts.perfectWeight).toBe(10 + 3 + 3);
    expect(counts.dmsCorrect).toBe(4);
  });

  it("does not treat a cleared line with a miss or skip as perfect", () => {
    expect(
      isPerfectLine({ correctCount: 3, wrongCount: 1, skipCount: 0, questionTotal: 3 }),
    ).toBe(false);
    expect(
      isPerfectLine({ correctCount: 2, wrongCount: 0, skipCount: 1, questionTotal: 3 }),
    ).toBe(false);
    expect(
      isPerfectLine({ correctCount: 0, wrongCount: 0, skipCount: 0, questionTotal: 0 }),
    ).toBe(false);
  });
});

describe("parseDailyScore", () => {
  it("allows a streak update with no score", () => {
    expect(parseDailyScore({ date: "2026-10-09" })).toEqual({ ok: true, score: null });
    expect(
      parseDailyScore({
        date: "2026-10-09",
        correctCount: 0,
        wrongCount: 0,
        skipCount: 0,
        questionTotal: 0,
      }),
    ).toEqual({ ok: true, score: null });
    expect(parseDailyScore({ date: "2026-10-09", questionTotal: 0 }).ok).toBe(false);
  });

  it("accepts a finished daily and rejects a padded score", () => {
    expect(
      parseDailyScore({
        date: "2026-10-09",
        correctCount: 3,
        wrongCount: 0,
        skipCount: 0,
        questionTotal: 3,
      }),
    ).toEqual({
      ok: true,
      score: { correctCount: 3, wrongCount: 0, skipCount: 0, questionTotal: 3 },
    });
    expect(
      parseDailyScore({
        correctCount: 10,
        wrongCount: 0,
        skipCount: 0,
        questionTotal: 3,
      }).ok,
    ).toBe(false);
    expect(parseDailyScore({ correctCount: 1 }).ok).toBe(false);
  });
});
