import { getNextPlayableLine, getPlayableLines, type LineSource } from "../content/playable.js";
import { MINI_GAME_SIZE } from "../../types/game.js";

export type Rng = () => number;

export type MiniGameQueueOptions = {
  personalStarred: number[];
  /** Golden lines — taken first (cap ~3–5 at the UI/API layer). */
  personalLoved?: number[];
  crowdPopular?: number[];
  size?: number;
  rng?: Rng;
};

function defaultRng(): number {
  return Math.random();
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Playable lines that have a playable next line — valid MCQ prompts. */
export function getValidPromptIndices(source: LineSource): number[] {
  return getPlayableLines(source)
    .filter((line) => getNextPlayableLine(source, line.index) !== undefined)
    .map((line) => line.index);
}

/** Sort prompt indices so a mini-game walks the transcript forward. */
export function chronologicalPromptQueue(indices: number[]): number[] {
  return [...indices].sort((a, b) => a - b);
}

/**
 * Runs of 2+ personal stars that are adjacent in the valid-prompt list
 * (no other quiz prompt between them).
 */
export function findStarStreaks(
  validPromptIndices: number[],
  starredIndices: number[],
): number[][] {
  const validSet = new Set(validPromptIndices);
  const starred = chronologicalPromptQueue(
    starredIndices.filter((index) => validSet.has(index)),
  );
  if (starred.length < 2) return [];

  const validPos = new Map(validPromptIndices.map((index, pos) => [index, pos]));
  const streaks: number[][] = [];
  let run: number[] = [starred[0]!];

  for (let i = 1; i < starred.length; i += 1) {
    const prev = starred[i - 1]!;
    const curr = starred[i]!;
    const prevPos = validPos.get(prev);
    const currPos = validPos.get(curr);
    if (prevPos !== undefined && currPos !== undefined && currPos === prevPos + 1) {
      run.push(curr);
    } else {
      if (run.length >= 2) streaks.push(run);
      run = [curr];
    }
  }
  if (run.length >= 2) streaks.push(run);
  return streaks;
}

function pickStreak(
  streaks: number[][],
  size: number,
  rng: Rng,
  lovedSet: ReadonlySet<number>,
): number[] | null {
  if (streaks.length === 0) return null;
  const maxLen = Math.max(...streaks.map((streak) => streak.length));
  const longest = streaks.filter((streak) => streak.length === maxLen);
  const chosen = longest[Math.floor(rng() * longest.length)] ?? longest[0]!;
  if (chosen.length <= size) return [...chosen];

  // Contiguous window of `size`; prefer windows that keep loved lines.
  const windowCount = chosen.length - size + 1;
  let bestLoved = -1;
  const candidates: number[] = [];
  for (let start = 0; start < windowCount; start += 1) {
    const lovedHits = chosen
      .slice(start, start + size)
      .filter((index) => lovedSet.has(index)).length;
    if (lovedHits > bestLoved) {
      bestLoved = lovedHits;
      candidates.length = 0;
      candidates.push(start);
    } else if (lovedHits === bestLoved) {
      candidates.push(start);
    }
  }
  const bestStart = candidates[Math.floor(rng() * candidates.length)] ?? 0;
  return chosen.slice(bestStart, bestStart + size);
}

export function buildMiniGameQueue(
  source: LineSource,
  options: MiniGameQueueOptions,
): number[] {
  const {
    personalStarred,
    personalLoved = [],
    crowdPopular = [],
    size = MINI_GAME_SIZE,
    rng = defaultRng,
  } = options;

  const valid = getValidPromptIndices(source);
  const validSet = new Set(valid);

  const lovedValid = personalLoved.filter((index) => validSet.has(index));
  const lovedSet = new Set(lovedValid);

  const allPersonal = [
    ...new Set([
      ...lovedValid,
      ...personalStarred.filter((index) => validSet.has(index)),
    ]),
  ];

  const streak = pickStreak(findStarStreaks(valid, allPersonal), size, rng, lovedSet);
  const streakSet = new Set(streak ?? []);

  const loved = shuffle(
    lovedValid.filter((index) => !streakSet.has(index)),
    rng,
  );
  const afterLoved = new Set([...streakSet, ...loved]);

  const personal = shuffle(
    personalStarred.filter((index) => validSet.has(index) && !afterLoved.has(index)),
    rng,
  );
  const personalSet = new Set([...afterLoved, ...personal]);

  const crowd = shuffle(
    crowdPopular.filter(
      (index) => validSet.has(index) && !personalSet.has(index),
    ),
    rng,
  );
  const used = new Set([...personalSet, ...crowd]);

  const fillerPool = shuffle(
    valid.filter((index) => !used.has(index)),
    rng,
  );

  const queue: number[] = [];
  // Streak first so a large star pool cannot drop the chain; chrono sort preserves order.
  if (streak) {
    for (const index of streak) {
      if (queue.length >= size) break;
      queue.push(index);
    }
  }
  for (const index of loved) {
    if (queue.length >= size) break;
    queue.push(index);
  }
  for (const index of personal) {
    if (queue.length >= size) break;
    queue.push(index);
  }
  for (const index of crowd) {
    if (queue.length >= size) break;
    queue.push(index);
  }
  for (const index of fillerPool) {
    if (queue.length >= size) break;
    queue.push(index);
  }

  return chronologicalPromptQueue(queue);
}
