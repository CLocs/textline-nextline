import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { buildMcq } from "../src/lib/game/mcq.js";

const title: Title = {
  id: "test",
  title: "Test",
  sourceFilename: "test.srt",
  importedAt: "2026-01-01T00:00:00.000Z",
  lineCount: 5,
  lines: [
    { index: 0, text: "Line A", kind: "dialogue", startMs: 0, endMs: 1000 },
    { index: 1, text: "Line B", kind: "dialogue", startMs: 1000, endMs: 2000 },
    { index: 2, text: "Line C", kind: "dialogue", startMs: 2000, endMs: 3000 },
    { index: 3, text: "Line D", kind: "sdh", startMs: 3000, endMs: 4000 },
    { index: 4, text: "Line E", kind: "dialogue", startMs: 4000, endMs: 5000 },
  ],
};

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("buildMcq", () => {
  it("returns null when there is no next playable line", () => {
    expect(buildMcq(title, 4)).toBeNull();
  });

  it("skips junk lines when finding the correct answer", () => {
    const question = buildMcq(title, 1, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question!.correctLineIndex).toBe(2);
  });

  it("never offers junk lines as choices", () => {
    const question = buildMcq(title, 0, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question!.choices.every((choice) => choice.lineIndex !== 3)).toBe(true);
  });

  it("includes the correct next line among choices", () => {
    const question = buildMcq(title, 0, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question).not.toBeNull();
    expect(question!.promptText).toBe("Line A");
    expect(question!.correctLineIndex).toBe(1);
    expect(question!.choices.some((choice) => choice.lineIndex === 1)).toBe(true);
    expect(question!.choices.length).toBeGreaterThanOrEqual(3);
  });

  it("does not offer lead-in lines that are already on the card", () => {
    const scene = titleFromLines([
      "The door opened.",
      "She looked back.",
      "We should leave now.",
      "The ship is ready.",
      "I need the map.",
      "The weather is terrible today.",
      "Bring the horses around.",
    ]);
    const question = buildMcq(scene, 2, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question).not.toBeNull();
    expect(question!.leadIn.map((line) => line.lineIndex)).toEqual([0, 1]);
    expect(question!.choices.every((choice) => choice.lineIndex !== 0 && choice.lineIndex !== 1)).toBe(
      true,
    );
    expect(question!.choices.some((choice) => choice.lineIndex === question!.correctLineIndex)).toBe(
      true,
    );
  });

  it("never includes the prompt line as a choice", () => {
    const question = buildMcq(title, 1, 4, fixedRng([0.9, 0.8, 0.7, 0.6, 0.5]));
    expect(question!.choices.every((choice) => choice.lineIndex !== 1)).toBe(true);
  });

  it("rejects a nearby look-alike of the correct next line", () => {
    const wolf = titleFromLines([
      "Bring some of them chicks around here sometime, huh?",
      "Let 'em watch.",
      "Let 'em watch. Know what I mean?",
      "Hey, Zip! You tell your sister I was asking about her.",
      "He was already making so much money selling Quaaludes.",
      "Getting any pussy with that thing or what?",
    ]);
    const question = buildMcq(wolf, 0, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question).not.toBeNull();
    expect(question!.correctLineIndex).toBe(1);
    expect(question!.choices.some((choice) => choice.lineIndex === 1)).toBe(true);
    expect(question!.choices.every((choice) => choice.lineIndex !== 2)).toBe(true);
    expect(question!.choices.length).toBeGreaterThanOrEqual(3);
  });

  it("does not keep two distractors that are look-alikes of each other", () => {
    const echo = titleFromLines([
      "Hello there.",
      "The ship is ready.",
      "Let 'em watch.",
      "Let 'em watch. Know what I mean?",
      "I need to go to the store now.",
      "The weather is terrible today.",
    ]);
    const question = buildMcq(echo, 0, 4, fixedRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(question).not.toBeNull();
    const lookAlikeCount = question!.choices.filter(
      (choice) => choice.lineIndex === 2 || choice.lineIndex === 3,
    ).length;
    expect(lookAlikeCount).toBeLessThanOrEqual(1);
  });

  it("returns null when every other playable line is a look-alike", () => {
    const clones = titleFromLines([
      "Hello there friend.",
      "Let 'em watch.",
      "Let 'em watch. Know what I mean?",
    ]);
    expect(buildMcq(clones, 0, 4, fixedRng([0.1, 0.2, 0.3]))).toBeNull();
  });
});

function titleFromLines(texts: string[]): Title {
  return {
    id: "test",
    title: "Test",
    sourceFilename: "test.srt",
    importedAt: "2026-01-01T00:00:00.000Z",
    lineCount: texts.length,
    lines: texts.map((text, index) => ({
      index,
      text,
      kind: "dialogue",
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
    })),
  };
}
