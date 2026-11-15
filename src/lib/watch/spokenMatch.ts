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
/** A lookback only locks a line with enough words to be a place in the movie. */
const SUFFICIENT_LINE_TOKENS = 5;
const REVIEW_MIN_COVERAGE = 0.5;
/** Two sufficient lines ending this close are not a lock yet. */
const REVIEW_END_GAP = 3;

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

export type HeardToken = {
  token: string;
  at: number;
};

export type WindowMatch = {
  lineIndex: number;
  score: number;
  /** When the matched words were heard, so the clock can catch up. */
  heardAt: number;
};

/**
 * Latest sufficient line inside a stretch of already-heard words.
 * Words have to sit together. A short line, a thin overlap, or two lines
 * ending together is not a lock.
 */
export function matchHeardWindow(
  heard: readonly HeardToken[],
  lines: readonly SpokenLine[],
  skipLineIndex?: number,
): WindowMatch | null {
  if (heard.length < MIN_HITS) return null;
  const heardTokens = heard.map((token) => token.token);

  let best: { lineIndex: number; score: number; heardAt: number; end: number } | null = null;
  let secondEnd = -1;
  let secondScore = 0;

  for (const line of lines) {
    if (line.index === skipLineIndex) continue;
    const tokens = tokenize(line.text);
    if (tokens.length < SUFFICIENT_LINE_TOKENS) continue;
    const aligned = alignLine(heardTokens, tokens);
    if (!aligned) continue;
    const score = aligned.hits / tokens.length;
    const heardAt = heard[aligned.start]?.at;
    if (heardAt === undefined) continue;
    if (!best || aligned.end > best.end || (aligned.end === best.end && score > best.score)) {
      if (best) {
        secondEnd = best.end;
        secondScore = best.score;
      }
      best = { lineIndex: line.index, score, heardAt, end: aligned.end };
    } else if (aligned.end > secondEnd || (aligned.end === secondEnd && score > secondScore)) {
      secondEnd = aligned.end;
      secondScore = score;
    }
  }

  if (!best) return null;
  if (secondEnd >= 0 && best.end - secondEnd < REVIEW_END_GAP && best.score - secondScore < AMBIGUOUS_GAP) {
    return null;
  }
  return { lineIndex: best.lineIndex, score: best.score, heardAt: best.heardAt };
}

/** Rightmost place the line's words sit together. One missing final word still counts. */
function alignLine(heard: string[], line: string[]): { hits: number; start: number; end: number } | null {
  const full = rightmostRun(heard, line, line.length);
  const shorter = line.length > MIN_HITS ? rightmostRun(heard, line.slice(0, -1), line.length) : null;
  if (!full) return shorter;
  if (!shorter) return full;
  if (shorter.hits > full.hits) return shorter;
  if (shorter.hits === full.hits && shorter.end > full.end) return shorter;
  return full;
}

function rightmostRun(
  heard: string[],
  line: string[],
  coverageOf: number,
): { hits: number; start: number; end: number } | null {
  if (line.length === 0 || coverageOf === 0) return null;
  let lineAt = line.length - 1;
  let end = -1;
  let start = -1;
  let hits = 0;
  for (let i = heard.length - 1; i >= 0 && lineAt >= 0; i -= 1) {
    if (heard[i] !== line[lineAt]) continue;
    if (end < 0) end = i;
    start = i;
    hits += 1;
    lineAt -= 1;
  }
  if (hits < MIN_HITS || start < 0 || end < 0) return null;
  if (hits / coverageOf < REVIEW_MIN_COVERAGE) return null;
  if (end - start + 1 > coverageOf + 2) return null;
  return { hits, start, end };
}
