/** Pixel gap between curate rows — keep in sync with `.curate-item` margin-bottom. */
export const VIRTUAL_LIST_GAP = 8;

export function offsetsForSizes(sizes: number[], gap: number): number[] {
  const offsets = new Array(sizes.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < sizes.length; i++) {
    offsets[i + 1] = offsets[i] + sizes[i] + gap;
  }
  return offsets;
}

function firstIndexWhere(offsets: number[], compare: (value: number) => boolean): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compare(offsets[mid])) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Inclusive start / exclusive end of items that intersect the viewport,
 * expanded by `overscan` rows and clamped to the list.
 */
export function visibleWindow(
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): { start: number; end: number } {
  const count = Math.max(0, offsets.length - 1);
  if (count === 0) return { start: 0, end: 0 };

  const firstGreaterThanScroll = firstIndexWhere(offsets, (value) => value > scrollTop);
  let start = firstGreaterThanScroll - 1;
  if (start < 0) start = 0;
  if (start >= count) start = count - 1;

  const bottom = scrollTop + Math.max(0, viewportHeight);
  let end = firstIndexWhere(offsets, (value) => value >= bottom);
  if (end < start) end = start;
  if (end > count) end = count;

  start = Math.max(0, start - overscan);
  end = Math.min(count, end + overscan);
  return { start, end };
}
