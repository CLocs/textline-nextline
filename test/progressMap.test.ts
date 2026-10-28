import { describe, expect, it } from "vitest";
import {
  connectorsForQueue,
  progressWindow,
  PROGRESS_WINDOW,
  slotStateAt,
  visibleProgress,
} from "../src/lib/game/progressMap.js";

describe("progressWindow", () => {
  it("shows every slot when the run fits", () => {
    expect(progressWindow(3, 1)).toEqual({
      start: 0,
      length: 3,
      preceding: 0,
      remaining: 0,
    });
    expect(progressWindow(10, 4)).toEqual({
      start: 0,
      length: 10,
      preceding: 0,
      remaining: 0,
    });
  });

  it("pins a 10-dot window at the start and end", () => {
    expect(progressWindow(40, 0)).toMatchObject({ start: 0, preceding: 0, remaining: 30 });
    expect(progressWindow(40, 39)).toMatchObject({
      start: 30,
      preceding: 30,
      remaining: 0,
    });
  });

  it("keeps the current slot in a centered window", () => {
    const mid = progressWindow(40, 20);
    expect(mid.length).toBe(PROGRESS_WINDOW);
    expect(mid.start).toBeLessThanOrEqual(20);
    expect(mid.start + mid.length).toBeGreaterThan(20);
    expect(mid.preceding + mid.length + mid.remaining).toBe(40);
  });
});

describe("slotStateAt", () => {
  it("marks past slots from outcomes and the current slot as current", () => {
    expect(slotStateAt(0, 2, 5, ["correct", "skip"], null)).toBe("correct");
    expect(slotStateAt(1, 2, 5, ["correct", "skip"], null)).toBe("skip");
    expect(slotStateAt(2, 2, 5, ["correct", "skip"], null)).toBe("current");
    expect(slotStateAt(3, 2, 5, ["correct", "skip"], null)).toBe("upcoming");
  });

  it("paints the hold outcome on the current slot", () => {
    expect(slotStateAt(2, 2, 5, [], "correct")).toBe("correct");
    expect(slotStateAt(2, 2, 5, [], "skip")).toBe("skip");
  });

  it("keeps a Hard miss on the current slot", () => {
    expect(slotStateAt(2, 2, 5, [null, null, "miss"], null)).toBe("miss");
  });
});

describe("connectorsForQueue", () => {
  it("connects transcript neighbors and gaps the rest", () => {
    expect(connectorsForQueue([1, 2, 10, 11, 12], [1, 2, 3, 10, 11, 12])).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });
});

describe("visibleProgress", () => {
  it("clips connectors at the window edge", () => {
    const connected = Array.from({ length: 39 }, () => true);
    const view = visibleProgress(40, 0, [], connected, null);
    expect(view.slots).toHaveLength(10);
    expect(view.slots[8]?.connectedToNext).toBe(true);
    expect(view.slots[9]?.connectedToNext).toBe(false);
    expect(view.remaining).toBe(30);
  });
});
