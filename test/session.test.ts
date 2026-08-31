import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { goBackQuestion, skipQuestion, startRun, submitAnswer } from "../src/lib/game/session.js";

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

function fullRun(firstPrompt = 1) {
  return startRun("test", { mode: "fun", length: "full", firstPromptLineIndex: firstPrompt });
}

describe("submitAnswer", () => {
  it("starts history with the opening line", () => {
    const run = fullRun(1);
    expect(run.history).toEqual([{ lineIndex: 1, via: "start" }]);
  });

  it("tracks wrong answers without ending Fun mode runs", () => {
    const run = fullRun(1);
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
    const run = fullRun(1);
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
    const run = fullRun(3);
    const result = submitAnswer(run, title, 4);
    expect(result.correct).toBe(true);
    expect(result.run.phase).toBe("complete");
    expect(result.run.correctCount).toBe(1);
  });

  it("ends medium mode on a miss", () => {
    const run = startRun("test", { mode: "medium", length: "full", firstPromptLineIndex: 1 });
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

describe("mini-game runs", () => {
  it("jumps to queued prompts instead of walking sequentially", () => {
    const run = startRun("test", {
      mode: "fun",
      length: "mini",
      firstPromptLineIndex: 1,
      questionQueue: [1, 3],
    });
    const result = submitAnswer(run, title, 3);
    expect(result.run.promptLineIndex).toBe(3);
    expect(result.run.questionIndex).toBe(1);
    expect(result.run.phase).toBe("playing");
  });

  it("completes after the last queued question", () => {
    const run = startRun("test", {
      mode: "fun",
      length: "mini",
      firstPromptLineIndex: 3,
      questionQueue: [3],
    });
    const result = submitAnswer(run, title, 4);
    expect(result.run.phase).toBe("complete");
    expect(result.run.correctCount).toBe(1);
  });
});

describe("goBackQuestion", () => {
  it("restores the previous prompt after a correct answer", () => {
    let run = fullRun(1);
    run = submitAnswer(run, title, 3).run;
    expect(run.promptLineIndex).toBe(3);
    expect(run.correctCount).toBe(1);

    const previous = goBackQuestion(run);
    expect(previous).not.toBeNull();
    expect(previous!.promptLineIndex).toBe(1);
    expect(previous!.correctCount).toBe(0);
    expect(previous!.history).toEqual([{ lineIndex: 1, via: "start" }]);
  });

  it("restores state after skip", () => {
    let run = fullRun(1);
    run = skipQuestion(run, title)!.run;
    const previous = goBackQuestion(run);
    expect(previous!.promptLineIndex).toBe(1);
    expect(previous!.skipCount).toBe(0);
  });

  it("returns null on the first question", () => {
    expect(goBackQuestion(fullRun(1))).toBeNull();
  });
});

describe("skipQuestion", () => {
  it("reveals the answer and advances in fun mode", () => {
    const run = fullRun(1);
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
