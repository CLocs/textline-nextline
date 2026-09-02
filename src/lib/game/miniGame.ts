import { getNextPlayableLine, getPlayableLines, type LineSource } from "../content/playable.js";
import { MINI_GAME_SIZE } from "../../types/game.js";

export type Rng = () => number;

export type MiniGameQueueOptions = {
  personalStarred: number[];
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

export function buildMiniGameQueue(
  source: LineSource,
  options: MiniGameQueueOptions,
): number[] {
  const {
    personalStarred,
    crowdPopular = [],
    size = MINI_GAME_SIZE,
    rng = defaultRng,
  } = options;

  const valid = getValidPromptIndices(source);
  const validSet = new Set(valid);

  const personal = shuffle(
    personalStarred.filter((index) => validSet.has(index)),
    rng,
  );
  const personalSet = new Set(personal);

  const crowd = shuffle(
    crowdPopular.filter(
      (index) => validSet.has(index) && !personalSet.has(index),
    ),
    rng,
  );
  const used = new Set([...personal, ...crowd]);

  const fillerPool = shuffle(
    valid.filter((index) => !used.has(index)),
    rng,
  );

  const queue: number[] = [];
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

  return queue;
}
