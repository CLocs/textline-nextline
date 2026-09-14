import type { Line } from "../../types/content.js";
import { getLine, type LineSource } from "../content/lines.js";
import { getPreviousPlayableLine, substantiveText } from "../content/playable.js";

/** Pull previous cues until the prompt beat has about this many words (effectively always). */
export const MIN_PROMPT_WORDS = 100;
/** Cap so we don't dump a whole scene into the question. */
export const MAX_LEAD_IN_LINES = 4;
/** Don't glue cues across a pause (new beat). */
export const MAX_LEAD_IN_GAP_MS = 4000;

export type PromptLeadIn = {
  lineIndex: number;
  text: string;
};

export function countPromptWords(text: string): number {
  return substantiveText(text).split(/\s+/).filter(Boolean).length;
}

/**
 * Previous playable lines to show with a short prompt.
 * The starred/quiz index stays on the last cue; these are display-only lead-in.
 */
export function leadInForPrompt(source: LineSource, promptLineIndex: number): PromptLeadIn[] {
  const prompt = getLine(source, promptLineIndex);
  if (!prompt) return [];

  let words = countPromptWords(prompt.text);
  if (words >= MIN_PROMPT_WORDS) return [];

  const lead: Line[] = [];
  let current = prompt;
  while (lead.length < MAX_LEAD_IN_LINES && words < MIN_PROMPT_WORDS) {
    const prev = getPreviousPlayableLine(source, current.index);
    if (!prev) break;
    if (current.startMs - prev.endMs > MAX_LEAD_IN_GAP_MS) break;
    lead.unshift(prev);
    words += countPromptWords(prev.text);
    current = prev;
  }
  return lead.map((line) => ({ lineIndex: line.index, text: line.text }));
}
