export type TimedLine = {
  index: number;
  startMs: number;
};

/** Movie time at a lock: that line's start, plus time since the phrase was heard. */
export function movieMsSinceLock(startMs: number, heardAt: number, now: number): number {
  return startMs + Math.max(0, now - heardAt);
}

/** How far behind the running clock a later phrase may still be. */
export const RESYNC_BEHIND_MS = 8_000;
/** How far ahead of the running clock the next phrase is allowed to land. */
export const RESYNC_AHEAD_MS = 90_000;

/**
 * Playable lines the mic may re-lock while the clock is already running.
 * The line that started the clock is excluded. Lines far behind or far ahead are too.
 */
export function upcomingLines<T extends { startMs: number }>(
  lines: readonly T[],
  anchorStartMs: number,
  movieMs: number,
): T[] {
  const earliest = movieMs - RESYNC_BEHIND_MS;
  const latest = movieMs + RESYNC_AHEAD_MS;
  const near: T[] = [];
  for (const line of lines) {
    if (line.startMs <= anchorStartMs) continue;
    if (line.startMs < earliest || line.startMs > latest) continue;
    near.push(line);
  }
  return near;
}

/**
 * The playable line the clock is on. Lines must be in transcript order.
 * Before the first cue, stay on the first line. After the last, stay on the last.
 */
export function lineAtMovieMs(lines: TimedLine[], movieMs: number): number | null {
  if (lines.length === 0) return null;
  let found = lines[0]!.index;
  for (const line of lines) {
    if (line.startMs <= movieMs) found = line.index;
    else break;
  }
  return found;
}
