import { describe, expect, it } from "vitest";
import type { Line } from "../src/types/content.js";
import { isJunkLine, isPlayableLine, substantiveText } from "../src/lib/content/playable.js";

function line(text: string, kind: Line["kind"] = "dialogue"): Line {
  return { index: 0, text, kind, startMs: 0, endMs: 1000 };
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
