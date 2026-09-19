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

  const loved = shuffle(
    personalLoved.filter((index) => validSet.has(index)),
    rng,
  );
  const lovedSet = new Set(loved);

  const personal = shuffle(
    personalStarred.filter((index) => validSet.has(index) && !lovedSet.has(index)),
    rng,
  );
  const personalSet = new Set([...loved, ...personal]);

  const crowd = shuffle(
    crowdPopular.filter(
      (index) => validSet.has(index) && !personalSet.has(index),
    ),
    rng,
  );
  const used = new Set([...loved, ...personal, ...crowd]);

  const fillerPool = shuffle(
    valid.filter((index) => !used.has(index)),
    rng,
  );

  const queue: number[] = [];
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
