import { describe, expect, it } from "vitest";
import {
  followScrollTop,
  offsetsForSizes,
  scrolledAboveFollow,
  visibleWindow,
} from "../src/lib/ui/virtualWindow.js";

describe("offsetsForSizes", () => {
  it("stacks sizes with a gap after each item", () => {
    expect(offsetsForSizes([10, 20, 30], 8)).toEqual([0, 18, 46, 84]);
  });

  it("returns a single zero for an empty list", () => {
    expect(offsetsForSizes([], 8)).toEqual([0]);
  });
});

describe("visibleWindow", () => {
  const offsets = offsetsForSizes([100, 100, 100, 100, 100], 0);

  it("returns empty bounds for an empty list", () => {
    expect(visibleWindow([0], 0, 400, 2)).toEqual({ start: 0, end: 0 });
  });

  it("covers the first screen without overscan", () => {
    expect(visibleWindow(offsets, 0, 250, 0)).toEqual({ start: 0, end: 3 });
  });

  it("advances when the scroller moves mid-list", () => {
    expect(visibleWindow(offsets, 250, 250, 0)).toEqual({ start: 2, end: 5 });
  });

  it("applies overscan and clamps to the ends", () => {
    expect(visibleWindow(offsets, 0, 100, 2)).toEqual({ start: 0, end: 3 });
    expect(visibleWindow(offsets, 400, 100, 2)).toEqual({ start: 2, end: 5 });
  });
});

describe("follow scroll", () => {
  it("parks the live line on the bottom edge", () => {
    expect(followScrollTop(1000, 80, 400)).toBe(688);
  });

  it("stays at the top when the line is still on the first screen", () => {
    expect(followScrollTop(40, 80, 400)).toBe(0);
  });

  it("holds when the viewport is above the live line", () => {
    expect(scrolledAboveFollow(100, 200)).toBe(true);
    expect(scrolledAboveFollow(190, 200)).toBe(false);
  });
});
