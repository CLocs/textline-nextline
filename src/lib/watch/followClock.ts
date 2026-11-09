export type TimedLine = {
  index: number;
  startMs: number;
};

/** Movie time at a lock, plus time since the phrase was heard. */
export function movieMsSinceLock(startMs: number, heardAt: number, now: number): number {
  return startMs + Math.max(0, now - heardAt);
}

/** How far behind the running clock a re-sync may look. */
export const RESYNC_BEHIND_MS = 45_000;
/** How far ahead of the running clock a re-sync may look. */
export const RESYNC_AHEAD_MS = 30_000;
/**
 * A line that has just been said hands off to the next cue when that cue
 * starts within this long. A longer pause stays on the line that finished.
 */
export const CUE_HANDOFF_MS = 1_500;

/**
 * Playable lines the mic may re-lock while the clock is already running.
 * Lines behind the estimate are included, so a clock that ran ahead can be pulled back.
 */
export function linesNearClock<T extends { startMs: number }>(
  lines: readonly T[],
  movieMs: number,
): T[] {
  const earliest = movieMs - RESYNC_BEHIND_MS;
  const latest = movieMs + RESYNC_AHEAD_MS;
  const near: T[] = [];
  for (const line of lines) {
    if (line.startMs < earliest || line.startMs > latest) continue;
    near.push(line);
  }
  return near;
}

/**
 * Movie time when the phrase was heard.
 * A finished phrase is at the end of its cue, or on the next cue when that cue is already starting.
 * A phrase dated from its first word stays at this cue's start, and elapsed time catches up.
 */
export function movieMsAtPhrase(
  line: { startMs: number; endMs: number },
  nextStartMs: number | null,
  phraseComplete: boolean,
): number {
  if (!phraseComplete || line.endMs <= line.startMs) return line.startMs;
  if (
    nextStartMs != null &&
    nextStartMs >= line.endMs &&
    nextStartMs - line.endMs <= CUE_HANDOFF_MS
  ) {
    return nextStartMs;
  }
  return line.endMs;
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
