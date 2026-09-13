import { describe, expect, it } from "vitest";
import { cohortSummary, isPerfectScore } from "../src/lib/runs/cohort.js";

describe("isPerfectScore", () => {
  it("requires 10/10 with no wrongs or skips", () => {
    expect(
      isPerfectScore({ correctCount: 10, wrongCount: 0, skipCount: 0, questionTotal: 10 }),
    ).toBe(true);
    expect(
      isPerfectScore({ correctCount: 10, wrongCount: 0, skipCount: 1, questionTotal: 10 }),
    ).toBe(false);
    expect(
      isPerfectScore({ correctCount: 9, wrongCount: 0, skipCount: 0, questionTotal: 10 }),
    ).toBe(false);
  });
});

describe("cohortSummary", () => {
  it("lists names and scores, and notes when both are perfect", () => {
    expect(
      cohortSummary(
        [
          { displayName: "Sam", correctCount: 10, wrongCount: 0, skipCount: 0 },
          { displayName: "Pat", correctCount: 10, wrongCount: 0, skipCount: 0 },
        ],
        10,
      ),
    ).toBe("Sam 10/10 · Pat 10/10 — both perfect");
  });

  it("omits the perfect note when someone missed", () => {
    expect(
      cohortSummary(
        [
          { displayName: "Sam", correctCount: 10, wrongCount: 0, skipCount: 0 },
          { displayName: "Pat", correctCount: 8, wrongCount: 1, skipCount: 1 },
        ],
        10,
      ),
    ).toBe("Sam 10/10 · Pat 8/10");
  });
});
