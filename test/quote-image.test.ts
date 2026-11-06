import { describe, expect, it } from "vitest";
import {
  defaultFocusThisLine,
  quoteCardCopy,
} from "../src/lib/quoteImage/renderQuoteImage.js";

describe("quote image focus", () => {
  it("keeps textline → next line when this line is not the punch", () => {
    expect(
      quoteCardCopy({
        quoteText: "Wait for the cream.",
        nextText: "And you.",
        focusLine: false,
      }),
    ).toEqual({ setup: "Wait for the cream.", punch: "And you." });
  });

  it("features this line and drops the next line", () => {
    expect(
      quoteCardCopy({
        quoteText: "  I drink your milkshake. ",
        nextText: "I drink it up.",
        focusLine: true,
      }),
    ).toEqual({ setup: "", punch: "I drink your milkshake." });
  });

  it("features a line that has no next line", () => {
    expect(
      quoteCardCopy({
        quoteText: "Here's looking at you, kid.",
        nextText: "  ",
        focusLine: false,
      }),
    ).toEqual({ setup: "", punch: "Here's looking at you, kid." });
  });

  it("opens on this line when the line is quote-marked", () => {
    expect(defaultFocusThisLine(true, true)).toBe(true);
    expect(defaultFocusThisLine(false, true)).toBe(false);
    expect(defaultFocusThisLine(false, false)).toBe(true);
  });
});
