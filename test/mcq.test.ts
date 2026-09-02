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

  it("never includes the prompt line as a choice", () => {
    const question = buildMcq(title, 1, 4, fixedRng([0.9, 0.8, 0.7, 0.6, 0.5]));
    expect(question!.choices.every((choice) => choice.lineIndex !== 1)).toBe(true);
  });
});
