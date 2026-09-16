/** Reject MCQ look-alikes at or above this score. Retune from tests, not a second design pass. */
export const SIMILARITY_THRESHOLD = 0.6;

/** Lowercase, strip punctuation / curly quotes, collapse space. */
export function normalizeChoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeChoiceText(text).split(/\s+/).filter(Boolean));
}

/**
 * max(token Dice, token containment) after normalize.
 * Containment catches a short line that is almost a prefix of a longer one
 * (Let 'em watch. vs Let 'em watch. Know what I mean?).
 */
export function lineSimilarity(a: string, b: string): number {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const dice = (2 * intersection) / (aTokens.size + bTokens.size);
  const containment = intersection / Math.min(aTokens.size, bTokens.size);
  return Math.max(dice, containment);
}

export function tooSimilar(
  a: string,
  b: string,
  threshold = SIMILARITY_THRESHOLD,
): boolean {
  return lineSimilarity(a, b) >= threshold;
}
