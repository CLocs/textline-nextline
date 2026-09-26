import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import {
  buildMiniGameQueue,
  chronologicalPromptQueue,
  findStarStreaks,
  getValidPromptIndices,
} from "../src/lib/game/miniGame.js";

const title: Title = {
  id: "test",
  title: "Test",
  sourceFilename: "test.srt",
  importedAt: "2026-01-01T00:00:00.000Z",
  lineCount: 6,
  lines: [
    { index: 0, text: "[SFX]", kind: "sdh", startMs: 0, endMs: 1000 },
    { index: 1, text: "Hello.", kind: "dialogue", startMs: 1000, endMs: 2000 },
    { index: 2, text: "Bridge.", kind: "dialogue", startMs: 2000, endMs: 3000 },
    { index: 3, text: "Goodbye.", kind: "dialogue", startMs: 3000, endMs: 4000 },
    { index: 4, text: "The end.", kind: "dialogue", startMs: 4000, endMs: 5000 },
  ],
};

function dialogueTitle(id: string, count: number): Title {
  const lines = Array.from({ length: count }, (_, index) => ({
    index,
    text: `Line ${index}.`,
    kind: "dialogue" as const,
    startMs: index * 1000,
    endMs: index * 1000 + 900,
  }));
  return {
    id,
    title: id,
    sourceFilename: `${id}.srt`,
    importedAt: "2026-01-01T00:00:00.000Z",
    lineCount: count,
    lines,
  };
}

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("buildMiniGameQueue", () => {
  it("includes personal starred prompts and sorts chronologically", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [3],
      size: 2,
      rng: fixedRng([0.1, 0.2]),
    });
    expect(queue).toHaveLength(2);
    expect(queue).toContain(3);
    expect(queue).toEqual([...queue].sort((a, b) => a - b));
  });

  it("fills with crowd popular before random prompts", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [],
      crowdPopular: [2],
      size: 2,
      rng: fixedRng([0.1, 0.2, 0.3]),
    });
    expect(queue).toHaveLength(2);
    expect(queue).toContain(2);
    expect(queue).toEqual([...queue].sort((a, b) => a - b));
    expect(getValidPromptIndices(title)).toContain(queue[0]!);
  });

  it("skips crowd lines already in personal stars", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [3],
      crowdPopular: [3, 2],
      size: 3,
      rng: fixedRng([0.1, 0.2, 0.3, 0.4]),
    });
    expect(queue).toContain(3);
    expect(queue).toContain(2);
    expect(queue.filter((index) => index === 3)).toHaveLength(1);
    expect(queue).toEqual([...queue].sort((a, b) => a - b));
  });

  it("fills with other valid prompts in transcript order", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [],
      size: 3,
      rng: fixedRng([0.9, 0.8, 0.7, 0.6]),
    });
    expect(queue).toEqual([1, 2, 3]);
  });

  it("puts loved prompts before other personal stars", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [1, 2, 3],
      personalLoved: [3],
      size: 2,
      rng: fixedRng([0.1, 0.2, 0.3]),
    });
    expect(queue).toContain(3);
    expect(queue).toHaveLength(2);
    expect(queue).toEqual([...queue].sort((a, b) => a - b));
  });

  it("biases the queue to include a personal star streak", () => {
    const long = dialogueTitle("streaky", 20);
    // Valid prompts: 0..18. Stars: a streak 5-6-7 plus many scattered.
    const personalStarred = [0, 2, 4, 5, 6, 7, 9, 11, 13, 15, 17];
    const queue = buildMiniGameQueue(long, {
      personalStarred,
      size: 5,
      rng: fixedRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    });
    expect(queue).toEqual(expect.arrayContaining([5, 6, 7]));
    const streakPos = queue.indexOf(5);
    expect(queue[streakPos + 1]).toBe(6);
    expect(queue[streakPos + 2]).toBe(7);
  });
});

describe("findStarStreaks", () => {
  it("finds adjacent valid-prompt runs of length 2+", () => {
    expect(findStarStreaks([1, 2, 3, 4], [1, 2, 4])).toEqual([[1, 2]]);
    expect(findStarStreaks([1, 2, 3, 4], [1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(findStarStreaks([1, 2, 3, 4], [1, 3])).toEqual([]);
  });
});

describe("chronologicalPromptQueue", () => {
  it("sorts ascending without mutating input", () => {
    const input = [5, 1, 3];
    expect(chronologicalPromptQueue(input)).toEqual([1, 3, 5]);
    expect(input).toEqual([5, 1, 3]);
  });
});
