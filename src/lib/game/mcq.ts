import type { Line, Title } from "../../types/content.js";
import { getLine } from "../content/lines.js";
import { getNextPlayableLine, getPlayableLines, isPlayableLine } from "../content/playable.js";

export type McqChoice = {
  lineIndex: number;
  text: string;
};

export type McqQuestion = {
  promptLineIndex: number;
  promptText: string;
  correctLineIndex: number;
  choices: McqChoice[];
};

export type Rng = () => number;

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

function linePosition(title: Title, lineIndex: number): number {
  return title.lines.findIndex((line) => line.index === lineIndex);
}

function pickDistractors(
  title: Title,
  promptLineIndex: number,
  correct: Line,
  count: number,
  rng: Rng,
): Line[] {
  const promptPosition = linePosition(title, promptLineIndex);
  const playable = getPlayableLines(title);
  const candidates = playable.filter(
    (line) => line.index !== correct.index && line.index !== promptLineIndex,
  );

  const ranked = [...candidates].sort((a, b) => {
    const distanceA = Math.abs(linePosition(title, a.index) - promptPosition);
    const distanceB = Math.abs(linePosition(title, b.index) - promptPosition);
    return distanceA - distanceB;
  });

  const near = ranked.slice(0, Math.max(count * 3, count));
  const pool = near.length >= count ? near : ranked;
  return shuffle(pool, rng).slice(0, count);
}

export function buildMcq(
  title: Title,
  promptLineIndex: number,
  choiceCount = 4,
  rng: Rng = defaultRng,
): McqQuestion | null {
  const prompt = getLine(title, promptLineIndex);
  if (!prompt || !isPlayableLine(prompt)) return null;

  const correct = getNextPlayableLine(title, promptLineIndex);
  if (!correct) return null;

  const playableCount = getPlayableLines(title).length;
  const distractorCount = Math.min(choiceCount - 1, playableCount - 2);
  if (distractorCount < 1) return null;

  const distractors = pickDistractors(title, promptLineIndex, correct, distractorCount, rng);
  const choices = shuffle(
    [
      { lineIndex: correct.index, text: correct.text },
      ...distractors.map((line) => ({ lineIndex: line.index, text: line.text })),
    ],
    rng,
  );

  return {
    promptLineIndex: prompt.index,
    promptText: prompt.text,
    correctLineIndex: correct.index,
    choices,
  };
}
