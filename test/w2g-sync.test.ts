import { describe, expect, it, vi } from "vitest";
import {
  lineAtMovieMs,
  linesNearClock,
  movieMsAtPhrase,
  movieMsSinceLock,
} from "../src/lib/watch/followClock.js";
import { createHeardLog } from "../src/lib/watch/heardLog.js";
import { getLineNotesForTitle, saveLineNote } from "../src/lib/watch/lineNotes.js";
import { speechRetryNotice, speechStopReason } from "../src/lib/watch/speechListener.js";
import { matchHeardWindow, matchSpokenLine, type HeardToken, type SpokenLine } from "../src/lib/watch/spokenMatch.js";

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

function at(words: string, start: number, step = 200): HeardToken[] {
  return words.split(" ").map((token, index) => ({ token, at: start + index * step }));
}

describe("matchHeardWindow", () => {
  const scene: SpokenLine[] = [
    { index: 12, text: "It's gotten so big, you just can't find your way." },
    { index: 13, text: "The grocery store on the corner is now a supermarket." },
    { index: 2, text: "Come here!" },
  ];

  it("locks the latest sufficient line and the time those words were heard", () => {
    const heard = [
      ...at("its gotten so big you just cant find your way", 1_000),
      ...at("the grocery store on the corner is now a supermarket", 5_000),
    ];
    const match = matchHeardWindow(heard, scene);
    expect(match?.lineIndex).toBe(13);
    expect(match?.heardAt).toBe(5_000);
  });

  it("keeps listening when the only lines are too short", () => {
    expect(matchHeardWindow(at("come here", 1_000), scene)).toBeNull();
  });

  it("keeps listening when the words of a line are spread across the stretch", () => {
    const heard = at(
      "its aa gotten aa so aa big aa you aa just aa cant aa find aa your aa way",
      1_000,
      400,
    );
    expect(matchHeardWindow(heard, scene)).toBeNull();
  });

  it("keeps listening when two sufficient lines end together", () => {
    const pair: SpokenLine[] = [
      { index: 1, text: "one two three four five six seven eight" },
      { index: 2, text: "nine two three four five six seven eight" },
    ];
    expect(matchHeardWindow(at("two three four five six seven eight", 1_000), pair)).toBeNull();
  });
});

describe("heard log", () => {
  it("keeps the time a word first appeared, then commits the final", () => {
    const log = createHeardLog();
    log.interim("It's gotten so", 1_000);
    log.interim("It's gotten so big, you just can't", 2_500);
    const live = log.tokensSince(2_000);
    expect(live.map((token) => token.token)).toEqual(["big", "you", "just", "cant"]);
    expect(live[0]?.at).toBe(2_500);

    const span = log.final("It's gotten so big, you just can't find your way.", 4_000);
    expect(span).toEqual({ startedAt: 1_000, endedAt: 4_000 });
    expect(log.tokensSince(2_000).map((token) => token.token)).toEqual([
      "big",
      "you",
      "just",
      "cant",
      "find",
      "your",
      "way",
    ]);
    expect(log.tokensSince(0)[0]).toEqual({ token: "its", at: 1_000 });
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

  it("re-syncs to lines behind the clock as well as ahead of it", () => {
    const lines = [
      { index: 1, startMs: 0 },
      { index: 2, startMs: 10_000 },
      { index: 3, startMs: 20_000 },
      { index: 4, startMs: 40_000 },
      { index: 9, startMs: 200_000 },
    ];
    expect(linesNearClock(lines, 12_000).map((line) => line.index)).toEqual([1, 2, 3, 4]);
    expect(linesNearClock(lines, 180_000).map((line) => line.index)).toEqual([9]);
  });

  it("puts a finished phrase on the next cue when that cue is already starting", () => {
    const line = { startMs: 2_677_467, endMs: 2_680_886 };
    expect(movieMsAtPhrase(line, 2_680_970, true)).toBe(2_680_970);
    expect(movieMsAtPhrase(line, 2_690_000, true)).toBe(2_680_886);
    expect(movieMsAtPhrase(line, 2_680_970, false)).toBe(2_677_467);
  });

  it("stays on the line until the next cue, then the last cue", () => {
    expect(lineAtMovieMs(timed, 1000)).toBe(0);
    expect(lineAtMovieMs(timed, 3999)).toBe(0);
    expect(lineAtMovieMs(timed, 4000)).toBe(2);
    expect(lineAtMovieMs(timed, 20_000)).toBe(5);
    expect(lineAtMovieMs([], 20_000)).toBeNull();
  });
});

describe("speech listener errors", () => {
  it("stops only when the mic is blocked or the language is refused", () => {
    expect(speechStopReason("not-allowed")).toMatch(/blocked/);
    expect(speechStopReason("service-not-allowed")).toMatch(/blocked/);
    expect(speechStopReason("language-not-supported")).toMatch(/English/);
    expect(speechStopReason("no-speech")).toBeNull();
    expect(speechStopReason("network")).toBeNull();
    expect(speechStopReason("audio-capture")).toBeNull();
    expect(speechStopReason("aborted")).toBeNull();
  });

  it("keeps listening through a dropped service or a missing mic", () => {
    expect(speechRetryNotice("network")).toMatch(/Still listening/);
    expect(speechRetryNotice("audio-capture")).toMatch(/address bar/);
    expect(speechRetryNotice("no-speech")).toBeNull();
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
