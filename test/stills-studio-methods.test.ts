import { describe, expect, it } from "vitest";
import { SIMPSONS_THEME_OFFSET_MS } from "../src/lib/content/extractStills.js";
import {
  describeStudioMethod,
  pickNextStudioMethod,
  studioMethodsForShow,
  studioVoteHint,
} from "../src/lib/content/stillsStudioMethods.js";

const FRAMES = [0, 72, 133, 193, 260, 323];
const THEME = { offsetMs: SIMPSONS_THEME_OFFSET_MS, timeScale: 1, seek: "start" as const };

describe("studioMethodsForShow", () => {
  it("starts Simpsons on the theme skip", () => {
    expect(studioMethodsForShow("The Simpsons")[0]?.id).toBe("theme-57");
  });

  it("starts movies at zero offset", () => {
    expect(studioMethodsForShow("The Matrix")[0]?.id).toBe("zero");
  });
});

describe("studioVoteHint", () => {
  it("detects early-ok late-down from late thumbs only", () => {
    expect(studioVoteHint(FRAMES, { 193: "down", 260: "down", 323: "down" })).toBe("early-ok-late-down");
  });

  it("detects all-down", () => {
    expect(
      studioVoteHint(FRAMES, {
        0: "down",
        72: "down",
        133: "down",
        193: "down",
        260: "down",
        323: "down",
      }),
    ).toBe("all-down");
  });
});

describe("pickNextStudioMethod", () => {
  it("skips PAL on NTSC Simpsons unless late frames are the miss", () => {
    const next = pickNextStudioMethod({
      show: "The Simpsons",
      fps: 29.97,
      current: THEME,
      frameOrder: FRAMES,
      votes: { 0: "down", 72: "down", 133: "down", 193: "down", 260: "down", 323: "down" },
    });
    expect(next?.id).toBe("theme-52");
  });

  it("picks PAL when early frames are fine and late ones are not", () => {
    const next = pickNextStudioMethod({
      show: "The Simpsons",
      fps: 29.97,
      current: THEME,
      frameOrder: FRAMES,
      votes: { 193: "down", 260: "down", 323: "down" },
    });
    expect(next?.id).toBe("theme-57-pal");
  });

  it("picks PAL first on 25fps movies", () => {
    const next = pickNextStudioMethod({
      show: "Star Wars",
      fps: 25,
      current: { offsetMs: 0, timeScale: 1, seek: "start" },
      frameOrder: FRAMES,
    });
    expect(next?.id).toBe("pal");
  });

  it("returns null after every recipe is tried", () => {
    const tried = studioMethodsForShow("The Simpsons").map((row) => row.id);
    expect(
      pickNextStudioMethod({
        show: "The Simpsons",
        current: THEME,
        triedIds: tried,
        frameOrder: FRAMES,
      }),
    ).toBeNull();
  });

  it("labels unmatched knobs as custom so the next named recipe still runs", () => {
    const current = describeStudioMethod("The Simpsons", {
      offsetMs: -55_000,
      timeScale: 0.96,
      seek: "start",
    });
    expect(current.id.startsWith("custom:")).toBe(true);
    const next = pickNextStudioMethod({
      show: "The Simpsons",
      fps: 29.97,
      current: { offsetMs: -55_000, timeScale: 0.96, seek: "start" },
      triedIds: [current.id],
      frameOrder: FRAMES,
    });
    expect(next?.id).toBe("theme-57");
  });
});
