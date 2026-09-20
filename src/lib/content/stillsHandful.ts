import type { Line, Title } from "../../types/content.js";

const HANDFUL = 6;
const MIN_TEXT = 16;
const EDGE = 0.08;

const JUNK =
  /tvsubtitles\.net|opensubtitles|addic7ed|subscene|^\[chorus\]|#+\s*the simpsons\b/i;

function distinctive(lines: Line[]): Line[] {
  return lines.filter((line) => {
    if (line.kind !== "dialogue") return false;
    const text = line.text.trim();
    if (text.length < MIN_TEXT) return false;
    if (JUNK.test(text)) return false;
    return true;
  });
}

function trimEdges(lines: Line[], count: number): Line[] {
  if (lines.length <= count) return lines;
  const times = lines.map((line) => line.startMs);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = max - min;
  if (span <= 0) {
    const sliced = lines.slice(1, -1);
    return sliced.length >= count ? sliced : lines;
  }
  const lo = min + span * EDGE;
  const hi = max - span * EDGE;
  const inner = lines.filter((line) => line.startMs >= lo && line.startMs <= hi);
  return inner.length >= count ? inner : lines;
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

function poolForHandful(title: Title, starIndices: number[]): Line[] {
  const playable = distinctive(title.lines);
  const starSet = new Set(starIndices);
  const starred = playable.filter((line) => starSet.has(line.index));
  const source = starred.length >= HANDFUL ? starred : playable;
  return trimEdges(source, HANDFUL);
}

function uniqueIndices(lines: Line[], count: number): number[] {
  const seen = new Set<number>();
  const indices: number[] = [];
  for (const line of lines) {
    if (seen.has(line.index)) continue;
    seen.add(line.index);
    indices.push(line.index);
    if (indices.length >= count) break;
  }
  return indices;
}

/** Six early/mid/late cues, skipping theme/credits. Prefer D1 stars. */
export function pickHandfulIndices(title: Title, starIndices: number[], count = HANDFUL): number[] {
  const pool = poolForHandful(title, starIndices);
  const starSet = new Set(starIndices);
  const starred = pool.filter((line) => starSet.has(line.index));
  if (starred.length >= count) {
    return spread(starred, count).map((line) => line.index);
  }

  const fill = spread(
    pool.filter((line) => !starSet.has(line.index)),
    count - starred.length,
  );
  return uniqueIndices([...starred, ...fill].sort((a, b) => a.index - b.index), count);
}

function pickFromBucket(bucket: Line[], exclude: Set<number>, rng: () => number): Line | null {
  const fresh = bucket.filter((line) => !exclude.has(line.index));
  const source = fresh.length > 0 ? fresh : bucket;
  if (source.length === 0) return null;
  const idx = Math.min(source.length - 1, Math.floor(rng() * source.length));
  return source[idx] ?? null;
}

/** Another spread of six, still avoiding openings/credits and the current set when possible. */
export function shuffleHandfulIndices(
  title: Title,
  starIndices: number[],
  current: number[] = [],
  rng: () => number = Math.random,
  count = HANDFUL,
): number[] {
  const pool = poolForHandful(title, starIndices);
  if (pool.length <= count) {
    return uniqueIndices(pool, count);
  }
  const exclude = new Set(current);
  const min = pool[0]!.startMs;
  const max = pool[pool.length - 1]!.startMs;
  const span = Math.max(1, max - min);
  const picked: Line[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const lo = min + (i * span) / count;
    const hi = min + ((i + 1) * span) / count;
    const bucket = pool.filter((line) => {
      if (used.has(line.index)) return false;
      if (i === count - 1) return line.startMs >= lo;
      return line.startMs >= lo && line.startMs < hi;
    });
    const line = pickFromBucket(bucket.length > 0 ? bucket : pool.filter((row) => !used.has(row.index)), exclude, rng);
    if (!line) continue;
    used.add(line.index);
    exclude.add(line.index);
    picked.push(line);
  }
  if (picked.length < count) {
    for (const line of pool) {
      if (used.has(line.index)) continue;
      used.add(line.index);
      picked.push(line);
      if (picked.length >= count) break;
    }
  }
  return uniqueIndices(
    picked.sort((a, b) => a.index - b.index),
    count,
  );
}
