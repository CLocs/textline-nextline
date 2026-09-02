import { describe, expect, it } from "vitest";
import type { Title } from "../src/types/content.js";
import { buildMiniGameQueue, getValidPromptIndices } from "../src/lib/game/miniGame.js";

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

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("buildMiniGameQueue", () => {
  it("prioritizes personal starred prompts", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [3],
      size: 2,
      rng: fixedRng([0.1, 0.2]),
    });
    expect(queue).toHaveLength(2);
    expect(queue[0]).toBe(3);
  });

  it("fills with crowd popular before random prompts", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [],
      crowdPopular: [2],
      size: 2,
      rng: fixedRng([0.1, 0.2, 0.3]),
    });
    expect(queue).toHaveLength(2);
    expect(queue[0]).toBe(2);
    expect(getValidPromptIndices(title)).toContain(queue[1]);
  });

  it("skips crowd lines already in personal stars", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [3],
      crowdPopular: [3, 2],
      size: 3,
      rng: fixedRng([0.1, 0.2, 0.3, 0.4]),
    });
    expect(queue[0]).toBe(3);
    expect(queue).toContain(2);
    expect(queue.filter((index) => index === 3)).toHaveLength(1);
  });

  it("fills with other valid prompts", () => {
    const queue = buildMiniGameQueue(title, {
      personalStarred: [],
      size: 3,
      rng: fixedRng([0.9, 0.8, 0.7, 0.6]),
    });
    expect(queue).toHaveLength(3);
    expect(getValidPromptIndices(title)).toEqual([1, 2, 3]);
    for (const index of queue) {
      expect(getValidPromptIndices(title)).toContain(index);
    }
  });
});
