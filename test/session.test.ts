import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { skipQuestion, startRun, submitAnswer } from "../src/lib/game/session.js";

const title: Title = {
  id: "test",
  title: "Test",
  sourceFilename: "test.srt",
  importedAt: "2026-01-01T00:00:00.000Z",
  lineCount: 6,
  lines: [
    { index: 0, text: "[SFX]", kind: "sdh", startMs: 0, endMs: 1000 },
    { index: 1, text: "Hello.", kind: "dialogue", startMs: 1000, endMs: 2000 },
    { index: 2, text: "[Beep]", kind: "sdh", startMs: 2000, endMs: 3000 },
    { index: 3, text: "Goodbye.", kind: "dialogue", startMs: 3000, endMs: 4000 },
    { index: 4, text: "The end.", kind: "dialogue", startMs: 4000, endMs: 5000 },
  ],
};

describe("submitAnswer", () => {
  it("starts history with the opening line", () => {
    const run = startRun("test", "fun", 1);
    expect(run.history).toEqual([{ lineIndex: 1, via: "start" }]);
  });

  it("tracks wrong answers without ending Fun mode runs", () => {
    const run = startRun("test", "fun", 1);
    const result = submitAnswer(run, title, 4);
    expect(result.correct).toBe(false);
    expect(result.run.wrongCount).toBe(1);
    expect(result.run.phase).toBe("playing");
    expect(result.run.promptLineIndex).toBe(1);
    expect(result.run.history).toEqual([
      { lineIndex: 1, via: "start" },
      { lineIndex: 4, via: "incorrect" },
    ]);
  });

  it("advances to the next playable line on a correct answer", () => {
    const run = startRun("test", "fun", 1);
    const result = submitAnswer(run, title, 3);
    expect(result.correct).toBe(true);
    expect(result.run.correctCount).toBe(1);
    expect(result.run.promptLineIndex).toBe(3);
    expect(result.run.history).toEqual([
      { lineIndex: 1, via: "start" },
      { lineIndex: 3, via: "correct" },
    ]);
    expect(result.run.phase).toBe("playing");
  });

  it("completes after the final playable next-line guess", () => {
    const run = startRun("test", "fun", 3);
    const result = submitAnswer(run, title, 4);
    expect(result.correct).toBe(true);
    expect(result.run.phase).toBe("complete");
    expect(result.run.correctCount).toBe(1);
  });

  it("ends medium mode on a miss", () => {
    const run = startRun("test", "medium", 1);
    const result = submitAnswer(run, title, 4);
    expect(result.correct).toBe(false);
    expect(result.run.phase).toBe("complete");
    expect(result.run.endReason).toBe("miss");
    expect(result.run.history).toEqual([
      { lineIndex: 1, via: "start" },
      { lineIndex: 3, via: "incorrect" },
    ]);
  });
});

describe("skipQuestion", () => {
  it("reveals the answer and advances in fun mode", () => {
    const run = startRun("test", "fun", 1);
    const result = skipQuestion(run, title);
    expect(result).not.toBeNull();
    expect(result!.revealedText).toBe("Goodbye.");
    expect(result!.run.skipCount).toBe(1);
    expect(result!.run.promptLineIndex).toBe(3);
    expect(result!.run.history).toEqual([
      { lineIndex: 1, via: "start" },
      { lineIndex: 3, via: "skip" },
    ]);
    expect(result!.run.phase).toBe("playing");
  });
});
