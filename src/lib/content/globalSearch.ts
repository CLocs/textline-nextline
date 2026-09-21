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

/** Pre-normalized catalog slice so queries do not re-scan raw JSON + Unicode normalize. */
export type SearchIndex = {
  titles: Array<{ titleId: string; label: string; hay: string }>;
  lines: Array<{
    titleId: string;
    label: string;
    lineIndex: number;
    text: string;
    hay: string;
  }>;
};

const DEFAULT_TITLE_CAP = 15;
const DEFAULT_LINE_CAP = 40;
const INDEX_YIELD_EVERY = 8;

let cachedIndex: SearchIndex | null = null;
let cachedIndexEntryCount = -1;

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

function matchesTokens(hay: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((token) => hay.includes(token));
}

export type GlobalSearchOptions = {
  query: string;
  mode: "popular" | "mine";
  /** Crowd counts keyed by `${titleId}:${lineIndex}`. */
  popularCounts?: Map<string, number>;
  isStarred?: (titleId: string, lineIndex: number) => boolean;
  /** Optional starred keys (`titleId:lineIndex`) — preferred over repeated isStarred. */
  starredKeys?: ReadonlySet<string>;
  titleCap?: number;
  lineCap?: number;
  entries?: CatalogEntry[];
  /** Override for tests; defaults to eager catalog lookup. */
  resolveTitle?: (titleId: string) => Title | undefined;
  /** Prefer this over live getTitle scans when present. */
  index?: SearchIndex;
};

export function popularKey(titleId: string, lineIndex: number): string {
  return `${titleId}:${lineIndex}`;
}

function starredChecker(options: GlobalSearchOptions): (titleId: string, lineIndex: number) => boolean {
  if (options.starredKeys) {
    const keys = options.starredKeys;
    return (titleId, lineIndex) => keys.has(popularKey(titleId, lineIndex));
  }
  return options.isStarred ?? (() => false);
}

/**
 * Build a search index once (sync). Prefer {@link buildSearchIndexAsync} on the main thread.
 */
export function buildSearchIndex(
  entries: CatalogEntry[] = listCatalogEntries(),
  resolveTitle: (titleId: string) => Title | undefined = getTitleFromCatalog,
): SearchIndex {
  const titles: SearchIndex["titles"] = [];
  const lines: SearchIndex["lines"] = [];

  for (const entry of entries) {
    const label = catalogLabel(entry);
    titles.push({ titleId: entry.id, label, hay: normalize(label) });
    const title = resolveTitle(entry.id);
    if (!title) continue;
    for (const line of title.lines) {
      if (!isPlayableLine(line)) continue;
      lines.push({
        titleId: entry.id,
        label,
        lineIndex: line.index,
        text: line.text,
        hay: normalize(line.text),
      });
    }
  }

  return { titles, lines };
}

/** Chunked index build so opening Search does not freeze the UI. Cached per catalog size. */
export async function buildSearchIndexAsync(
  entries: CatalogEntry[] = listCatalogEntries(),
  resolveTitle: (titleId: string) => Title | undefined = getTitleFromCatalog,
): Promise<SearchIndex> {
  if (cachedIndex && cachedIndexEntryCount === entries.length) {
    return cachedIndex;
  }

  const titles: SearchIndex["titles"] = [];
  const lines: SearchIndex["lines"] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const label = catalogLabel(entry);
    titles.push({ titleId: entry.id, label, hay: normalize(label) });
    const title = resolveTitle(entry.id);
    if (title) {
      for (const line of title.lines) {
        if (!isPlayableLine(line)) continue;
        lines.push({
          titleId: entry.id,
          label,
          lineIndex: line.index,
          text: line.text,
          hay: normalize(line.text),
        });
      }
    }
    if (i > 0 && i % INDEX_YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }

  const index = { titles, lines };
  cachedIndex = index;
  cachedIndexEntryCount = entries.length;
  return index;
}

/**
 * Client-side catalog search over eager title JSON (or a prebuilt index).
 * Empty query: browse popular lines or personal stars (no title section).
 */
export function searchCatalog(options: GlobalSearchOptions): GlobalSearchResult {
  const tokens = tokenizeQuery(options.query);
  const titleCap = options.titleCap ?? DEFAULT_TITLE_CAP;
  const lineCap = options.lineCap ?? DEFAULT_LINE_CAP;
  const entries = options.entries ?? listCatalogEntries();
  const isStarred = starredChecker(options);
  const popularCounts = options.popularCounts;
  const resolveTitle = options.resolveTitle ?? getTitleFromCatalog;
  const index = options.index;

  if (tokens.length === 0) {
    return browseWithoutQuery({
      mode: options.mode,
      entries,
      isStarred,
      starredKeys: options.starredKeys,
      popularCounts,
      lineCap,
      resolveTitle,
      index,
    });
  }

  if (index) {
    return searchWithIndex({
      tokens,
      mode: options.mode,
      index,
      isStarred,
      starredKeys: options.starredKeys,
      popularCounts,
      titleCap,
      lineCap,
    });
  }

  return searchLive({
    tokens,
    mode: options.mode,
    entries,
    isStarred,
    popularCounts,
    titleCap,
    lineCap,
    resolveTitle,
  });
}

function searchWithIndex(input: {
  tokens: string[];
  mode: "popular" | "mine";
  index: SearchIndex;
  isStarred: (titleId: string, lineIndex: number) => boolean;
  starredKeys?: ReadonlySet<string>;
  popularCounts?: Map<string, number>;
  titleCap: number;
  lineCap: number;
}): GlobalSearchResult {
  const titleHits: SearchTitleHit[] = [];
  const lineHits: SearchLineHit[] = [];
  let starredTitleIds: Set<string> | null = null;
  if (input.mode === "mine") {
    starredTitleIds = new Set<string>();
    if (input.starredKeys) {
      for (const key of input.starredKeys) {
        const colon = key.lastIndexOf(":");
        if (colon > 0) starredTitleIds.add(key.slice(0, colon));
      }
    } else {
      for (const line of input.index.lines) {
        if (input.isStarred(line.titleId, line.lineIndex)) starredTitleIds.add(line.titleId);
      }
    }
  }

  for (const row of input.index.titles) {
    if (!matchesTokens(row.hay, input.tokens)) continue;
    if (starredTitleIds && !starredTitleIds.has(row.titleId)) continue;
    titleHits.push({ titleId: row.titleId, label: row.label });
  }

  for (const row of input.index.lines) {
    const starred = input.isStarred(row.titleId, row.lineIndex);
    if (input.mode === "mine" && !starred) continue;
    if (!matchesTokens(row.hay, input.tokens)) continue;
    lineHits.push({
      titleId: row.titleId,
      label: row.label,
      lineIndex: row.lineIndex,
      text: row.text,
      popularCount: input.popularCounts?.get(popularKey(row.titleId, row.lineIndex)),
      starred,
    });
  }

  sortLineHits(lineHits, input.mode);
  titleHits.sort((a, b) => a.label.localeCompare(b.label));

  return {
    titles: titleHits.slice(0, input.titleCap),
    lines: lineHits.slice(0, input.lineCap),
  };
}

function searchLive(input: {
  tokens: string[];
  mode: "popular" | "mine";
  entries: CatalogEntry[];
  isStarred: (titleId: string, lineIndex: number) => boolean;
  popularCounts?: Map<string, number>;
  titleCap: number;
  lineCap: number;
  resolveTitle: (titleId: string) => Title | undefined;
}): GlobalSearchResult {
  const titleHits: SearchTitleHit[] = [];
  const lineHits: SearchLineHit[] = [];

  for (const entry of input.entries) {
    const label = catalogLabel(entry);
    const titleMatches = matchesTokens(normalize(label), input.tokens);

    if (titleMatches) {
      if (input.mode === "mine") {
        const title = input.resolveTitle(entry.id);
        const hasStar =
          title?.lines.some((line) => isPlayableLine(line) && input.isStarred(entry.id, line.index)) ??
          false;
        if (hasStar) titleHits.push({ titleId: entry.id, label });
      } else {
        titleHits.push({ titleId: entry.id, label });
      }
    }

    const title = input.resolveTitle(entry.id);
    if (!title) continue;

    for (const line of title.lines) {
      if (!isPlayableLine(line)) continue;
      const starred = input.isStarred(entry.id, line.index);
      if (input.mode === "mine" && !starred) continue;
      if (!matchesTokens(normalize(line.text), input.tokens)) continue;

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
  titleHits.sort((a, b) => a.label.localeCompare(b.label));

  return {
    titles: titleHits.slice(0, input.titleCap),
    lines: lineHits.slice(0, input.lineCap),
  };
}

function browseWithoutQuery(input: {
  mode: "popular" | "mine";
  entries: CatalogEntry[];
  isStarred: (titleId: string, lineIndex: number) => boolean;
  starredKeys?: ReadonlySet<string>;
  popularCounts?: Map<string, number>;
  lineCap: number;
  resolveTitle: (titleId: string) => Title | undefined;
  index?: SearchIndex;
}): GlobalSearchResult {
  const lineHits: SearchLineHit[] = [];
  const entryById = new Map(input.entries.map((entry) => [entry.id, entry]));

  if (input.mode === "popular") {
    if (!input.popularCounts || input.popularCounts.size === 0) {
      // Do not scan ~200k lines waiting for the API / offline — empty until data arrives.
      return { titles: [], lines: [] };
    }
    const ranked = [...input.popularCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    for (const [key, count] of ranked) {
      const colon = key.lastIndexOf(":");
      if (colon < 0) continue;
      const titleId = key.slice(0, colon);
      const lineIndex = Number.parseInt(key.slice(colon + 1), 10);
      if (!Number.isFinite(lineIndex)) continue;
      const entry = entryById.get(titleId);
      if (!entry) continue;

      const fromIndex = input.index?.lines.find(
        (row) => row.titleId === titleId && row.lineIndex === lineIndex,
      );
      if (fromIndex) {
        lineHits.push({
          titleId,
          label: fromIndex.label,
          lineIndex,
          text: fromIndex.text,
          popularCount: count,
          starred: input.isStarred(titleId, lineIndex),
        });
      } else {
        const title = input.resolveTitle(titleId);
        const line = title?.lines.find((item) => item.index === lineIndex);
        if (!line || !isPlayableLine(line)) continue;
        lineHits.push({
          titleId,
          label: catalogLabel(entry),
          lineIndex,
          text: line.text,
          popularCount: count,
          starred: input.isStarred(titleId, lineIndex),
        });
      }
      if (lineHits.length >= input.lineCap) break;
    }
    return { titles: [], lines: lineHits };
  }

  // Mine browse: resolve only known stars — never walk the full catalog.
  const lineByKey = input.index
    ? new Map(input.index.lines.map((row) => [popularKey(row.titleId, row.lineIndex), row]))
    : null;

  if (input.starredKeys && input.starredKeys.size > 0) {
    for (const key of input.starredKeys) {
      const fromIndex = lineByKey?.get(key);
      if (fromIndex) {
        lineHits.push({
          titleId: fromIndex.titleId,
          label: fromIndex.label,
          lineIndex: fromIndex.lineIndex,
          text: fromIndex.text,
          popularCount: input.popularCounts?.get(key),
          starred: true,
        });
        continue;
      }
      const colon = key.lastIndexOf(":");
      if (colon < 0) continue;
      const titleId = key.slice(0, colon);
      const lineIndex = Number.parseInt(key.slice(colon + 1), 10);
      if (!Number.isFinite(lineIndex)) continue;
      const entry = entryById.get(titleId);
      const title = input.resolveTitle(titleId);
      const line = title?.lines.find((item) => item.index === lineIndex);
      if (!entry || !line || !isPlayableLine(line)) continue;
      lineHits.push({
        titleId,
        label: catalogLabel(entry),
        lineIndex,
        text: line.text,
        popularCount: input.popularCounts?.get(key),
        starred: true,
      });
    }
  } else if (input.index) {
    for (const row of input.index.lines) {
      if (!input.isStarred(row.titleId, row.lineIndex)) continue;
      lineHits.push({
        titleId: row.titleId,
        label: row.label,
        lineIndex: row.lineIndex,
        text: row.text,
        popularCount: input.popularCounts?.get(popularKey(row.titleId, row.lineIndex)),
        starred: true,
      });
    }
  } else {
    for (const entry of input.entries) {
      const title = input.resolveTitle(entry.id);
      if (!title) continue;
      const label = catalogLabel(entry);
      for (const line of title.lines) {
        if (!isPlayableLine(line)) continue;
        if (!input.isStarred(entry.id, line.index)) continue;
        lineHits.push({
          titleId: entry.id,
          label,
          lineIndex: line.index,
          text: line.text,
          popularCount: input.popularCounts?.get(popularKey(entry.id, line.index)),
          starred: true,
        });
      }
    }
  }

  sortLineHits(lineHits, "mine");
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
