export type TimedLine = {
  index: number;
  startMs: number;
};

/** Movie time at a lock: that line's start, plus time since the lock was accepted. */
export function movieMsSinceLock(startMs: number, confirmedAt: number, now: number): number {
  return startMs + Math.max(0, now - confirmedAt);
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
