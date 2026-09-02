import type { Line } from "../../types/content.js";
import type { LineSource } from "./lines.js";

export type { LineSource };

/** Bracketed SDH / SFX, e.g. [Bell Ringing] or [ Screams ] */
const BRACKET_SEGMENT = /\[[^\]]*\]/g;

/** Subtitle formatting hashes, e.g. ## TheSimpsons ## */
const HASH_RUN = /#+/g;

/**
 * True when a line is mostly sound effects, stage direction, or title cards —
 * not worth showing as a quiz prompt or answer.
 */
export function isJunkLine(line: Line): boolean {
  if (line.kind === "sdh") return true;
  return !hasSubstantiveDialogue(line.text);
}

export function isPlayableLine(line: Line): boolean {
  return !isJunkLine(line);
}

/** Dialogue remains after stripping bracketed SDH and hash markers. */
export function substantiveText(text: string): string {
  return text
    .replace(BRACKET_SEGMENT, " ")
    .replace(HASH_RUN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasSubstantiveDialogue(text: string): boolean {
  const trimmed = text.trim();

  if (/^\s*\[[^\]]+\]\s*$/.test(trimmed)) return false;
  if (/^\s*#+(\s*\[[^\]]+\]\s*)+#*\s*$/.test(trimmed)) return false;
  if (/^\s*(\[[^\]]+\]\s*)+$/.test(trimmed.replace(HASH_RUN, "").trim())) return false;

  const substantive = substantiveText(text);
  const letters = substantive.replace(/[^a-zA-Z']/g, "");
  if (letters.length < 3) return false;

  if (/#/.test(text) && !substantive.includes(" ") && /^[A-Za-z0-9]+$/.test(substantive)) {
    return false;
  }

  return true;
}

export function getPlayableLines(source: LineSource): Line[] {
  return source.lines.filter(isPlayableLine);
}

export function getNextPlayableLine(source: LineSource, afterLineIndex: number): Line | undefined {
  const position = source.lines.findIndex((line) => line.index === afterLineIndex);
  if (position === -1) return undefined;

  for (let i = position + 1; i < source.lines.length; i += 1) {
    const line = source.lines[i]!;
    if (isPlayableLine(line)) return line;
  }
  return undefined;
}

export function getFirstPlayableLine(source: LineSource): Line | undefined {
  return source.lines.find(isPlayableLine);
}

export function countPlayableQuestions(source: LineSource): number {
  return Math.max(getPlayableLines(source).length - 1, 0);
}

export function playableQuestionNumber(source: LineSource, promptLineIndex: number): number {
  const playable = getPlayableLines(source);
  const position = playable.findIndex((line) => line.index === promptLineIndex);
  return position === -1 ? 0 : position + 1;
}
