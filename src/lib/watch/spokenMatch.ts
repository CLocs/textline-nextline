import { normalizeChoiceText } from "../game/lineSimilarity.js";

export type SpokenLine = {
  index: number;
  text: string;
};

export type SpokenMatch = {
  lineIndex: number;
  score: number;
};

const MIN_HITS = 4;
const MIN_COVERAGE = 0.6;
const MIN_CONTAINMENT = 0.45;
/** A run of words inside a longer line, when the whole line was not said. */
const MIN_SPAN = 6;
/** Two lines this close are a weak match. Keep listening. */
const AMBIGUOUS_GAP = 0.08;
const MAX_HEARD_TOKENS = 40;

function tokenize(text: string): string[] {
  const normalized = normalizeChoiceText(text);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

/** Heard tokens found in order inside the line. Extra line words are skipped. */
function orderedHits(heard: string[], line: string[]): number {
  let at = 0;
  let hits = 0;
  for (const token of heard) {
    while (at < line.length && line[at] !== token) at += 1;
    if (at >= line.length) break;
    hits += 1;
    at += 1;
  }
  return hits;
}

/** One substituted word still counts, so a single mishear can lock. */
function bestOrderedHits(heard: string[], line: string[]): number {
  let best = orderedHits(heard, line);
  if (heard.length < 5) return best;
  for (let skip = 0; skip < heard.length; skip += 1) {
    const reduced = heard.filter((_, index) => index !== skip);
    const hits = orderedHits(reduced, line);
    if (hits > best) best = hits;
  }
  return best;
}

/**
 * Largest run of heard tokens aligned to a contiguous stretch of the line.
 * One substitution is allowed inside the run.
 */
function contiguousSpanHits(heard: string[], line: string[]): number {
  let best = 0;
  for (let heardStart = 0; heardStart < heard.length; heardStart += 1) {
    for (let lineStart = 0; lineStart < line.length; lineStart += 1) {
      let matched = 0;
      let mismatches = 0;
      let heardAt = heardStart;
      let lineAt = lineStart;
      while (heardAt < heard.length && lineAt < line.length) {
        if (heard[heardAt] === line[lineAt]) {
          matched += 1;
        } else if (mismatches === 1) {
          break;
        } else {
          mismatches += 1;
        }
        heardAt += 1;
        lineAt += 1;
      }
      if (matched > best) best = matched;
    }
  }
  return best;
}

function fullLineScore(heard: string[], line: string[]): number | null {
  if (line.length === 0) return null;
  const hits = bestOrderedHits(heard, line);
  const coverage = hits / line.length;
  const containment = hits / heard.length;
  if (hits < MIN_HITS || coverage < MIN_COVERAGE || containment < MIN_CONTAINMENT) return null;
  return coverage * 0.7 + containment * 0.3;
}

function spanScore(heard: string[], line: string[]): number | null {
  if (line.length === 0) return null;
  const span = contiguousSpanHits(heard, line);
  if (span < MIN_SPAN) return null;
  return span / Math.max(line.length, span);
}

type Scored = { kind: "none" } | { kind: "ambiguous" } | { kind: "match"; match: SpokenMatch };

function pickBest(
  lines: { index: number; tokens: string[] }[],
  scoreOf: (tokens: string[]) => number | null,
): Scored {
  let bestIndex = -1;
  let bestScore = 0;
  let secondScore = 0;

  for (const line of lines) {
    const score = scoreOf(line.tokens);
    if (score === null) continue;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestIndex = line.index;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestIndex < 0) return { kind: "none" };
  if (secondScore > 0 && bestScore - secondScore < AMBIGUOUS_GAP) return { kind: "ambiguous" };
  return { kind: "match", match: { lineIndex: bestIndex, score: bestScore } };
}

/**
 * A spoken phrase locks one playable line, or nothing.
 * A short phrase, a thin overlap, or two close lines is not a lock.
 * The whole-line pass is enough when they said the cue. A long stretch
 * inside a cue is only tried when nothing locked.
 */
export function matchSpokenLine(
  heard: string,
  lines: SpokenLine[],
  skipLineIndex?: number,
): SpokenMatch | null {
  const heardTokens = tokenize(heard).slice(-MAX_HEARD_TOKENS);
  if (heardTokens.length < MIN_HITS) return null;

  const tokenized = [];
  for (const line of lines) {
    if (line.index === skipLineIndex) continue;
    tokenized.push({ index: line.index, tokens: tokenize(line.text) });
  }

  const full = pickBest(tokenized, (tokens) => fullLineScore(heardTokens, tokens));
  if (full.kind === "match") return full.match;
  if (full.kind === "ambiguous" || heardTokens.length < MIN_SPAN) return null;

  const span = pickBest(tokenized, (tokens) => spanScore(heardTokens, tokens));
  return span.kind === "match" ? span.match : null;
}
