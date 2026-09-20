import type { Line, Title } from "../../types/content.js";

const HANDFUL = 6;
const MIN_TEXT = 16;

function distinctive(lines: Line[]): Line[] {
  return lines.filter((line) => line.kind === "dialogue" && line.text.trim().length >= MIN_TEXT);
}

function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  if (count <= 1) return [items[0]!];
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (items.length - 1)) / (count - 1));
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(items[idx]!);
  }
  return out;
}

/** Six early/mid/late cues: prefer D1 stars, fill from distinctive dialogue. */
export function pickHandfulIndices(title: Title, starIndices: number[], count = HANDFUL): number[] {
  const playable = distinctive(title.lines);
  const starSet = new Set(starIndices);
  const starred = playable.filter((line) => starSet.has(line.index));
  if (starred.length >= count) {
    return spread(starred, count).map((line) => line.index);
  }

  const fill = spread(
    playable.filter((line) => !starSet.has(line.index)),
    count - starred.length,
  );
  const merged = [...starred, ...fill].sort((a, b) => a.index - b.index);
  const seen = new Set<number>();
  const indices: number[] = [];
  for (const line of merged) {
    if (seen.has(line.index)) continue;
    seen.add(line.index);
    indices.push(line.index);
    if (indices.length >= count) break;
  }
  return indices;
}
