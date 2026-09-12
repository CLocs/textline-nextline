import { normalizeQuote } from "./titleMatch.js";
import { titlesLikelyMatch } from "./titleMatch.js";
import type { Title } from "../../types/content.js";
import type { ReadwiseMatch } from "./readwise.js";

export type StarSeed = {
  titleId: string;
  title: string;
  lineIndex: number;
  text: string;
  prevText: string | null;
  nextText: string | null;
  highlight: string;
  note: string | null;
  score: "exact" | "contains" | "window";
};

const MAX_WINDOW = 8;
const MIN_SPACED_NEEDLE = 16;

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
      const line = title.lines[hit.lineIndex];
      seeds.push({
        titleId: title.id,
        title: title.title,
        lineIndex: hit.lineIndex,
        text: line?.text ?? "",
        prevText: title.lines[hit.lineIndex - 1]?.text ?? null,
        nextText: title.lines[hit.lineIndex + 1]?.text ?? null,
        highlight: highlight.text,
        note: highlight.note,
        score: hit.score,
      });
    }
  }

  return seeds;
}

function compactQuote(text: string): string {
  return text
    .replace(/\[view highlight\]\([^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9*]/g, "");
}

function compactContains(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (!needle.includes("*")) return hay.includes(needle);
  const escaped = needle.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".");
  return new RegExp(escaped).test(hay);
}

function findLine(
  title: Title,
  highlight: string,
): { lineIndex: number; score: "exact" | "contains" | "window" } | null {
  const spacedNeedle = normalizeQuote(highlight);
  const compactNeedle = compactQuote(highlight);
  if (spacedNeedle.length < MIN_SPACED_NEEDLE && compactNeedle.replace(/\*/g, "").length < 12) {
    return null;
  }

  const compactLines = title.lines.map((line) => compactQuote(line.text));

  for (const line of title.lines) {
    if (normalizeQuote(line.text) === spacedNeedle) {
      return { lineIndex: line.index, score: "exact" };
    }
  }

  const needleLen = compactNeedle.replace(/\*/g, "").length;
  let best: { lineIndex: number; extra: number; window: number } | null = null;
  for (let i = 0; i < compactLines.length; i++) {
    let concat = "";
    for (let w = 0; w < MAX_WINDOW && i + w < compactLines.length; w++) {
      concat += compactLines[i + w];
      if (concat.length < 8) continue;
      if (!compactContains(concat, compactNeedle)) continue;
      const extra = Math.abs(concat.length - needleLen);
      if (!best || extra < best.extra || (extra === best.extra && w < best.window)) {
        best = { lineIndex: title.lines[i]!.index, extra, window: w + 1 };
      }
      break;
    }
  }

  if (!best) {
    let contains: { lineIndex: number; extra: number } | null = null;
    for (const line of title.lines) {
      const hay = normalizeQuote(line.text);
      if (hay.length < 8) continue;
      if (hay.includes(spacedNeedle) || spacedNeedle.includes(hay)) {
        const extra = Math.abs(hay.length - spacedNeedle.length);
        if (!contains || extra < contains.extra) contains = { lineIndex: line.index, extra };
      }
    }
    if (contains && contains.extra < spacedNeedle.length) {
      return { lineIndex: contains.lineIndex, score: "contains" };
    }
    return null;
  }

  return {
    lineIndex: best.lineIndex,
    score: best.window === 1 ? "contains" : "window",
  };
}
