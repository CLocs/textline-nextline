import type { Title } from "../../types/content.js";
import { getLine } from "../content/lines.js";
import { getNextPlayableLine, getPlayableLines, isPlayableLine } from "../content/playable.js";
import { tooSimilar } from "./lineSimilarity.js";
import { packCue, type MailCue } from "./dailyMailCatalog.js";

const MAIL_TEXT_LIMIT = 220;

export function clipMailText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= MAIL_TEXT_LIMIT) return flat;
  return `${flat.slice(0, MAIL_TEXT_LIMIT - 1).trimEnd()}…`;
}

/**
 * Framed prompts that can be a daily card: playable textline, a next line,
 * and at least one distractor that is not a look-alike of the answer.
 */
export function mailCuesForTitle(title: Title, lineIndices: number[], label: string): MailCue[] {
  const position = new Map<number, number>();
  title.lines.forEach((line, index) => position.set(line.index, index));
  const playable = getPlayableLines(title);
  const cues: MailCue[] = [];

  for (const lineIndex of lineIndices) {
    const prompt = getLine(title, lineIndex);
    if (!prompt || !isPlayableLine(prompt)) continue;
    const correct = getNextPlayableLine(title, lineIndex);
    if (!correct) continue;

    const promptPosition = position.get(prompt.index) ?? 0;
    const ranked = playable
      .filter((line) => line.index !== correct.index && line.index !== prompt.index)
      .sort((a, b) => {
        const distanceA = Math.abs((position.get(a.index) ?? 0) - promptPosition);
        const distanceB = Math.abs((position.get(b.index) ?? 0) - promptPosition);
        return distanceA - distanceB || a.index - b.index;
      });

    const distractors: string[] = [];
    for (const line of ranked) {
      if (tooSimilar(line.text, correct.text)) continue;
      if (distractors.some((text) => tooSimilar(line.text, text))) continue;
      const clipped = clipMailText(line.text);
      if (!clipped) continue;
      distractors.push(clipped);
      if (distractors.length >= 3) break;
    }
    if (distractors.length < 1) continue;

    const promptText = clipMailText(prompt.text);
    const correctText = clipMailText(correct.text);
    if (!promptText || !correctText) continue;

    cues.push({
      titleId: title.id,
      lineIndex: prompt.index,
      title: label.trim() || title.id,
      prompt: promptText,
      correct: correctText,
      distractors,
    });
  }

  return cues;
}

export function packMailCatalog(cues: MailCue[]): { version: 1; cues: ReturnType<typeof packCue>[] } {
  return { version: 1, cues: cues.map(packCue) };
}
