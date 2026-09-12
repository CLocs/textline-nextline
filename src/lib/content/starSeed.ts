import { normalizeQuote } from "./titleMatch.js";
import { titlesLikelyMatch } from "./titleMatch.js";
import type { Title } from "../../types/content.js";
import type { ReadwiseMatch } from "./readwise.js";

export type StarSeed = {
  titleId: string;
  title: string;
  lineIndex: number;
  text: string;
  highlight: string;
  note: string | null;
  score: "exact" | "contains";
};

export function matchHighlightsToTitles(matches: ReadwiseMatch[], titles: Title[]): StarSeed[] {
  const seeds: StarSeed[] = [];
  const used = new Set<string>();

  for (const match of matches) {
    const title = titles.find((t) =>
      titlesLikelyMatch(
        { title: match.title, year: match.year },
        { title: t.title, year: t.meta?.year ?? null },
      ),
    );
    if (!title) continue;

    for (const highlight of match.highlights) {
      const hit = findLine(title, highlight.text);
      if (!hit) continue;
      const key = `${title.id}:${hit.lineIndex}`;
      if (used.has(key)) continue;
      used.add(key);
      seeds.push({
        titleId: title.id,
        title: title.title,
        lineIndex: hit.lineIndex,
        text: title.lines[hit.lineIndex]?.text ?? "",
        highlight: highlight.text,
        note: highlight.note,
        score: hit.score,
      });
    }
  }

  return seeds;
}

function findLine(
  title: Title,
  highlight: string,
): { lineIndex: number; score: "exact" | "contains" } | null {
  const needle = normalizeQuote(highlight);
  if (needle.length < 16) return null;

  let contains: { lineIndex: number; extra: number } | null = null;
  for (const line of title.lines) {
    const hay = normalizeQuote(line.text);
    if (hay.length < 8) continue;
    if (hay === needle) return { lineIndex: line.index, score: "exact" };
    if (hay.includes(needle) || needle.includes(hay)) {
      const extra = Math.abs(hay.length - needle.length);
      if (!contains || extra < contains.extra) contains = { lineIndex: line.index, extra };
    }
  }
  if (contains && contains.extra < needle.length) {
    return { lineIndex: contains.lineIndex, score: "contains" };
  }
  return null;
}
