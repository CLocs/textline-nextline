import { describe, expect, it } from "vitest";
import {
  lineSimilarity,
  normalizeChoiceText,
  SIMILARITY_THRESHOLD,
  tooSimilar,
} from "../src/lib/game/lineSimilarity.js";

describe("lineSimilarity", () => {
  it("normalizes case, punctuation, and curly quotes", () => {
    expect(normalizeChoiceText("Let 'em watch.")).toBe("let em watch");
    expect(normalizeChoiceText("Let ’em watch!")).toBe("let em watch");
  });

  it("scores the Wolf look-alike pair at or above the threshold", () => {
    const score = lineSimilarity(
      "Let 'em watch.",
      "Let 'em watch. Know what I mean?",
    );
    expect(score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(tooSimilar("Let 'em watch.", "Let 'em watch. Know what I mean?")).toBe(
      true,
    );
  });

  it("keeps unrelated short lines well below the threshold", () => {
    expect(lineSimilarity("Line A", "Line B")).toBeLessThan(SIMILARITY_THRESHOLD);
    expect(tooSimilar("Line A", "Line B")).toBe(false);
  });
});
