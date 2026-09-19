import { describe, expect, it } from "vitest";
import { concatenateCueTexts } from "../src/lib/parallels/text.js";

describe("concatenateCueTexts", () => {
  it("joins trimmed cues into one beat", () => {
    expect(
      concatenateCueTexts([
        "Well, Hector, here's the game plan.",
        "You're gonna bring us two Absolut martinis.",
        "And then precisely seven and one half minutes after that, you're gonna bring us two more.",
      ]),
    ).toBe(
      "Well, Hector, here's the game plan. You're gonna bring us two Absolut martinis. And then precisely seven and one half minutes after that, you're gonna bring us two more.",
    );
  });

  it("drops empty cues", () => {
    expect(concatenateCueTexts(["  Hello.  ", "", "  Next.  "])).toBe("Hello. Next.");
  });
});
