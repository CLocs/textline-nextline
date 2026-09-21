import { getTitle as getTitleFromCatalog, listCatalogEntries } from "./browser.js";
import { catalogLabel } from "./libraryGroups.js";
import { isPlayableLine } from "./playable.js";
import type { CatalogEntry, Title } from "../../types/content.js";

export type SearchTitleHit = {
  titleId: string;
  label: string;
};

export type SearchLineHit = {
  titleId: string;
  label: string;
  lineIndex: number;
  text: string;
  popularCount?: number;
  starred?: boolean;
};

export type GlobalSearchResult = {
  titles: SearchTitleHit[];
  lines: SearchLineHit[];
};

const DEFAULT_TITLE_CAP = 15;
const DEFAULT_LINE_CAP = 40;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  return normalized.split(" ").filter((token) => token.length > 0);
}

function matchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = normalize(haystack);
  return tokens.every((token) => hay.includes(token));
}

export type GlobalSearchOptions = {
  query: string;
  mode: "popular" | "mine";
  /** Crowd counts keyed by `${titleId}:${lineIndex}`. */
  popularCounts?: Map<string, number>;
  isStarred?: (titleId: string, lineIndex: number) => boolean;
  titleCap?: number;
  lineCap?: number;
  entries?: CatalogEntry[];
  /** Override for tests; defaults to eager catalog lookup. */
  resolveTitle?: (titleId: string) => Title | undefined;
};

export function popularKey(titleId: string, lineIndex: number): string {
  return `${titleId}:${lineIndex}`;
}

/**
 * Client-side catalog search over eager title JSON.
 * Empty query: browse popular lines or personal stars (no title section).
 */
export function searchCatalog(options: GlobalSearchOptions): GlobalSearchResult {
  const tokens = tokenizeQuery(options.query);
  const titleCap = options.titleCap ?? DEFAULT_TITLE_CAP;
  const lineCap = options.lineCap ?? DEFAULT_LINE_CAP;
  const entries = options.entries ?? listCatalogEntries();
  const isStarred = options.isStarred ?? (() => false);
  const popularCounts = options.popularCounts;
  const resolveTitle = options.resolveTitle ?? getTitleFromCatalog;

  if (tokens.length === 0) {
    return browseWithoutQuery({
      mode: options.mode,
      entries,
      isStarred,
      popularCounts,
      lineCap,
      resolveTitle,
    });
  }

  const titleHits: SearchTitleHit[] = [];
  const lineHits: SearchLineHit[] = [];

  for (const entry of entries) {
    const label = catalogLabel(entry);
    const titleMatches = matchesTokens(label, tokens);

    if (titleMatches) {
      if (options.mode === "mine") {
        const title = resolveTitle(entry.id);
        const hasStar =
          title?.lines.some((line) => isPlayableLine(line) && isStarred(entry.id, line.index)) ??
          false;
        if (hasStar) titleHits.push({ titleId: entry.id, label });
      } else {
        titleHits.push({ titleId: entry.id, label });
      }
    }

    const title = resolveTitle(entry.id);
    if (!title) continue;

    for (const line of title.lines) {
      if (!isPlayableLine(line)) continue;
      const starred = isStarred(entry.id, line.index);
      if (options.mode === "mine" && !starred) continue;
      if (!matchesTokens(line.text, tokens)) continue;

      lineHits.push({
        titleId: entry.id,
        label,
        lineIndex: line.index,
        text: line.text,
        popularCount: popularCounts?.get(popularKey(entry.id, line.index)),
        starred,
      });
    }
  }

  sortLineHits(lineHits, options.mode);
  titleHits.sort((a, b) => a.label.localeCompare(b.label));

  return {
    titles: titleHits.slice(0, titleCap),
    lines: lineHits.slice(0, lineCap),
  };
}

function browseWithoutQuery(input: {
  mode: "popular" | "mine";
  entries: CatalogEntry[];
  isStarred: (titleId: string, lineIndex: number) => boolean;
  popularCounts?: Map<string, number>;
  lineCap: number;
  resolveTitle: (titleId: string) => Title | undefined;
}): GlobalSearchResult {
  const lineHits: SearchLineHit[] = [];

  if (input.mode === "popular" && input.popularCounts && input.popularCounts.size > 0) {
    const ranked = [...input.popularCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    for (const [key, count] of ranked) {
      const colon = key.lastIndexOf(":");
      if (colon < 0) continue;
      const titleId = key.slice(0, colon);
      const lineIndex = Number.parseInt(key.slice(colon + 1), 10);
      if (!Number.isFinite(lineIndex)) continue;
      const entry = input.entries.find((item) => item.id === titleId);
      const title = input.resolveTitle(titleId);
      const line = title?.lines.find((item) => item.index === lineIndex);
      if (!entry || !line || !isPlayableLine(line)) continue;
      lineHits.push({
        titleId,
        label: catalogLabel(entry),
        lineIndex,
        text: line.text,
        popularCount: count,
        starred: input.isStarred(titleId, lineIndex),
      });
      if (lineHits.length >= input.lineCap) break;
    }
    return { titles: [], lines: lineHits };
  }

  // Mine browse, or popular with no API data: scan stars / first playable cues lightly.
  for (const entry of input.entries) {
    const title = input.resolveTitle(entry.id);
    if (!title) continue;
    const label = catalogLabel(entry);
    for (const line of title.lines) {
      if (!isPlayableLine(line)) continue;
      const starred = input.isStarred(entry.id, line.index);
      if (input.mode === "mine" && !starred) continue;
      if (input.mode === "popular" && !starred) continue; // weak offline fallback: personal stars only
      lineHits.push({
        titleId: entry.id,
        label,
        lineIndex: line.index,
        text: line.text,
        popularCount: input.popularCounts?.get(popularKey(entry.id, line.index)),
        starred,
      });
    }
  }

  sortLineHits(lineHits, input.mode);
  return { titles: [], lines: lineHits.slice(0, input.lineCap) };
}

function sortLineHits(lineHits: SearchLineHit[], mode: "popular" | "mine") {
  if (mode === "popular") {
    lineHits.sort((a, b) => {
      const ca = a.popularCount ?? 0;
      const cb = b.popularCount ?? 0;
      if (cb !== ca) return cb - ca;
      return a.label.localeCompare(b.label) || a.lineIndex - b.lineIndex;
    });
    return;
  }
  lineHits.sort((a, b) => a.label.localeCompare(b.label) || a.lineIndex - b.lineIndex);
}
