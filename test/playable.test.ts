import { describe, expect, it } from "vitest";
import type { Line } from "../src/types/content.js";
import {
  isJunkLine,
  isLyricLine,
  isPlayableLine,
  isStillCueLine,
  stillCueIndices,
  substantiveText,
} from "../src/lib/content/playable.js";

function line(text: string, kind: Line["kind"] = "dialogue", index = 0): Line {
  return { index, text, kind, startMs: 0, endMs: 1000 };
}

describe("isJunkLine", () => {
  it("treats SDH blocks as junk", () => {
    expect(isJunkLine(line("[Bell Ringing]", "sdh"))).toBe(true);
  });

  it("treats bracket-only title cards as junk", () => {
    expect(isJunkLine(line("[Chorus] ## TheSimpsons ##"))).toBe(true);
    expect(isJunkLine(line("## [Jazzy Solo ]"))).toBe(true);
  });

  it("keeps real dialogue even with inline SDH", () => {
    expect(isJunkLine(line("D'oh! [ Screams ]"))).toBe(false);
    expect(isJunkLine(line("Well, children, it's the last day of school. [ All ] Yea!"))).toBe(false);
    expect(isJunkLine(line("Here are your grades."))).toBe(false);
  });
});

describe("substantiveText", () => {
  it("strips brackets and hashes", () => {
    expect(substantiveText("D'oh! [ Screams ]")).toBe("D'oh!");
    expect(substantiveText("[Chorus] ## TheSimpsons ##")).toBe("TheSimpsons");
  });
});

describe("isPlayableLine", () => {
  it("is the inverse of junk", () => {
    expect(isPlayableLine(line("Here are your grades."))).toBe(true);
    expect(isPlayableLine(line("[ Beeping ]", "sdh"))).toBe(false);
  });
});

describe("still cues", () => {
  it("skips lyrics and SDH, keeps spoken dialogue", () => {
    expect(isLyricLine(line("♪ Get out on the highway"))).toBe(true);
    expect(isStillCueLine(line("♪ Get out on the highway"))).toBe(false);
    expect(isStillCueLine(line("[Bell Ringing]", "sdh"))).toBe(false);
    expect(isStillCueLine(line("Two youths of dead-end ancestry."))).toBe(true);
  });

  it("lists still cue indices in order", () => {
    expect(
      stillCueIndices({
        lines: [
          line("♪ song", "dialogue", 0),
          line("Hello.", "dialogue", 1),
          line("[Boom]", "sdh", 2),
          line("The next line.", "dialogue", 3),
        ],
      }),
    ).toEqual([1, 3]);
  });
});
