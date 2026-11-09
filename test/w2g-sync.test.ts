import { describe, expect, it, vi } from "vitest";
import { lineAtMovieMs, movieMsSinceLock } from "../src/lib/watch/followClock.js";
import { getLineNotesForTitle, saveLineNote } from "../src/lib/watch/lineNotes.js";
import { matchSpokenLine, type SpokenLine } from "../src/lib/watch/spokenMatch.js";

const lines: SpokenLine[] = [
  { index: 4, text: "Let 'em watch. Know what I mean?" },
  { index: 9, text: "I don't know what you mean." },
  { index: 10, text: "I don't know what you said." },
  {
    index: 20,
    text: "We were somewhere around Barstow on the edge of the desert when the drugs began to take hold.",
  },
];

describe("matchSpokenLine", () => {
  it("locks a line that was spoken, including one misheard word", () => {
    const match = matchSpokenLine("let them watch know what I mean", lines);
    expect(match?.lineIndex).toBe(4);
  });

  it("locks a line when the phrase runs past it", () => {
    const match = matchSpokenLine(
      "let em watch know what I mean you got a problem",
      lines,
    );
    expect(match?.lineIndex).toBe(4);
  });

  it("locks a long line from a six-word stretch", () => {
    const match = matchSpokenLine("somewhere around Barstow on the edge", lines);
    expect(match?.lineIndex).toBe(20);
  });

  it("keeps listening on a short phrase", () => {
    expect(matchSpokenLine("you know", lines)).toBeNull();
  });

  it("keeps listening when the phrase is only a sliver of a long line", () => {
    expect(matchSpokenLine("around Barstow", lines)).toBeNull();
  });

  it("keeps listening when two lines match about as well", () => {
    expect(matchSpokenLine("I don't know what you", lines)).toBeNull();
  });

  it("picks the line once the last word distinguishes it", () => {
    const match = matchSpokenLine("I don't know what you mean", lines);
    expect(match?.lineIndex).toBe(9);
  });

  it("skips a line the listener already dismissed", () => {
    const match = matchSpokenLine("let them watch know what I mean", lines, 4);
    expect(match).toBeNull();
  });
});

describe("followClock", () => {
  const timed = [
    { index: 0, startMs: 1000 },
    { index: 2, startMs: 4000 },
    { index: 5, startMs: 9000 },
  ];

  it("adds elapsed time to the locked line's start", () => {
    expect(movieMsSinceLock(4000, 10_000, 12_500)).toBe(6500);
    expect(movieMsSinceLock(4000, 10_000, 9_000)).toBe(4000);
  });

  it("stays on the line until the next cue, then the last cue", () => {
    expect(lineAtMovieMs(timed, 1000)).toBe(0);
    expect(lineAtMovieMs(timed, 3999)).toBe(0);
    expect(lineAtMovieMs(timed, 4000)).toBe(2);
    expect(lineAtMovieMs(timed, 20_000)).toBe(5);
    expect(lineAtMovieMs([], 20_000)).toBeNull();
  });
});

describe("line notes", () => {
  it("saves a typed note in this browser and drops it when cleared", () => {
    const bag = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
      removeItem: (key: string) => {
        bag.delete(key);
      },
    });

    saveLineNote("the-odyssey-1997", 12, "  Matty said this was the lotus  ");
    expect(getLineNotesForTitle("the-odyssey-1997")).toEqual([
      {
        titleId: "the-odyssey-1997",
        lineIndex: 12,
        raw: "Matty said this was the lotus",
        text: "Matty said this was the lotus",
        speakers: [],
      },
    ]);
    expect(getLineNotesForTitle("other")).toEqual([]);

    saveLineNote("the-odyssey-1997", 12, "   ");
    expect(getLineNotesForTitle("the-odyssey-1997")).toEqual([]);
    vi.unstubAllGlobals();
  });
});
