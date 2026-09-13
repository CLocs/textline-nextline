import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseTitleYear, titlesLikelyMatch } from "./titleMatch.js";
import type { QueueFilm } from "../../types/contentQueue.js";

export type ReadwiseHighlight = {
  text: string;
  note: string | null;
};

export type ReadwiseDoc = {
  sourcePath: string;
  fullTitle: string;
  title: string;
  year: number | null;
  titleHints: { title: string; year: number | null }[];
  highlights: ReadwiseHighlight[];
};

export type ReadwiseMatch = {
  letterboxdUri: string;
  title: string;
  year: number | null;
  sourcePath: string;
  highlights: ReadwiseHighlight[];
};

const SKIP_DIR_NAMES = new Set(["full document contents", ".obsidian", ".git"]);
const GENERIC_NOTE_TITLES = new Set(["movie", "article", "untitled", "document"]);
const GENERIC_URL_SLUGS = new Set(["index", "script", "scripts", "moviescript", "transcript", "www"]);

export function parseReadwiseMarkdown(text: string, sourcePath = ""): ReadwiseDoc | null {
  const docs = parseReadwiseArticles(text, sourcePath);
  return docs[0] ?? null;
}

/** One Readwise export file can concatenate several articles under repeated `#` titles. */
export function parseReadwiseArticles(text: string, sourcePath = ""): ReadwiseDoc[] {
  const docs: ReadwiseDoc[] = [];
  for (const chunk of splitConcatenatedArticles(text)) {
    const doc = parseOneArticle(chunk, sourcePath);
    if (doc) docs.push(doc);
  }
  return docs;
}

function splitConcatenatedArticles(text: string): string[] {
  const parts = text.split(/^(?=#[^#])/m).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function parseOneArticle(text: string, sourcePath: string): ReadwiseDoc | null {
  const fullTitle = extractFullTitle(text) ?? headingTitle(text);
  if (!fullTitle) return null;

  const parsed = parseTitleYear(fullTitle);
  const highlights = extractHighlights(text);
  if (highlights.length === 0) return null;

  return {
    sourcePath,
    fullTitle,
    title: parsed.title,
    year: parsed.year,
    titleHints: collectTitleHints(text),
    highlights,
  };
}

function extractFullTitle(text: string): string | null {
  const meta = text.match(/^- Full Title:\s*(.+)$/m);
  return meta?.[1]?.trim() ?? null;
}

function headingTitle(text: string): string | null {
  const h1 = text.match(/^#\s+(.+)$/m);
  return h1?.[1]?.trim() ?? null;
}

function extractUrl(text: string): string | null {
  const match = text.match(/^- URL:\s*(\S+)/m);
  return match?.[1]?.trim() ?? null;
}

function collectTitleHints(text: string): { title: string; year: number | null }[] {
  const hints: { title: string; year: number | null }[] = [];
  const url = extractUrl(text);
  if (url) {
    const fromUrl = titleFromSourceUrl(url);
    if (fromUrl) hints.push(fromUrl);
  }
  for (const heading of text.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    const raw = heading[1]?.trim() ?? "";
    if (!raw || /^metadata$/i.test(raw) || /highlights/i.test(raw)) continue;
    const parsed = parseTitleYear(raw);
    if (parsed.title.length >= 4) hints.push(parsed);
  }
  return hints;
}

/** stockq.org/moviescript/P/payback.php → Payback */
export function titleFromSourceUrl(url: string): { title: string; year: number | null } | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const base = pathname.split("/").filter(Boolean).pop() ?? "";
  const stem = base.replace(/\.(php|html?|aspx?)$/i, "");
  const cleaned = stem.replace(/[-_]+/g, " ").trim();
  if (cleaned.length < 4) return null;
  if (GENERIC_URL_SLUGS.has(cleaned.toLowerCase())) return null;
  return parseTitleYear(cleaned);
}

function isGenericNoteTitle(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[:\-–—_,.]/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\b(full )?transcripts?\b/g, " ")
    .replace(/\bscripts?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length < 4 || GENERIC_NOTE_TITLES.has(normalized);
}

export function extractHighlights(text: string): ReadwiseHighlight[] {
  const chunks = splitHighlightSections(text);
  const highlights: ReadwiseHighlight[] = [];
  for (const chunk of chunks) {
    highlights.push(...parseHighlightList(chunk));
  }
  return highlights.filter((h) => h.text.length > 0);
}

function splitHighlightSections(text: string): string[] {
  const parts = text.split(/^## /m);
  const bodies: string[] = [];
  for (const part of parts) {
    const header = part.split(/\r?\n/, 1)[0] ?? "";
    if (/^highlights\b/i.test(header) || /^new highlights\b/i.test(header)) {
      bodies.push(part.slice(header.length));
    }
  }
  return bodies;
}

function parseHighlightList(section: string): ReadwiseHighlight[] {
  const items: ReadwiseHighlight[] = [];
  const lines = section.split(/\r?\n/);
  let current: string[] = [];
  let note: string | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const raw = current.join("\n").trim();
    const stripped = raw
      .replace(/\(\[View Highlight\]\([^)]+\)\)/gi, "")
      .replace(/^[-*]\s+/, "")
      .trim();
    if (stripped) items.push({ text: stripped, note });
    current = [];
    note = null;
  };

  for (const line of lines) {
    const noteMatch = line.match(/^\s{2,}-\s+Note:\s*(.*)$/);
    if (noteMatch) {
      note = noteMatch[1]?.trim() || note;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush();
      current = [line];
      continue;
    }
    if (current.length > 0) current.push(line);
  }
  flush();
  return items;
}

export function scanReadwiseVault(root: string): ReadwiseDoc[] {
  const docs: ReadwiseDoc[] = [];
  walkMarkdown(root, 0, 6, (filePath) => {
    let text: string;
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    if (!/^## /m.test(text) || !/highlights/i.test(text)) return;
    const parsed = parseReadwiseArticles(text, filePath);
    for (const doc of parsed) docs.push(doc);
  });
  return docs;
}

function walkMarkdown(
  dir: string,
  depth: number,
  maxDepth: number,
  visit: (filePath: string) => void,
): void {
  if (depth > maxDepth || !existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name.toLowerCase())) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkMarkdown(full, depth + 1, maxDepth, visit);
    } else if (name.toLowerCase().endsWith(".md")) {
      visit(full);
    }
  }
}

export function matchDocsToQueue(docs: ReadwiseDoc[], films: QueueFilm[]): ReadwiseMatch[] {
  const matches: ReadwiseMatch[] = [];
  for (const doc of docs) {
    const film = uniqueFilmForDoc(doc, films);
    if (!film) continue;
    matches.push({
      letterboxdUri: film.letterboxdUri,
      title: film.title,
      year: film.year,
      sourcePath: doc.sourcePath,
      highlights: doc.highlights,
    });
  }
  return mergeMatchesByUri(matches);
}

function uniqueFilmForDoc(doc: ReadwiseDoc, films: QueueFilm[]): QueueFilm | null {
  if (!isGenericNoteTitle(doc.title)) {
    const named = filmsMatching(films, { title: doc.title, year: doc.year });
    if (named.length === 1) return named[0]!;
  }
  const hintHits = new Map<string, QueueFilm>();
  for (const hint of doc.titleHints) {
    for (const film of filmsMatching(films, hint)) {
      hintHits.set(film.letterboxdUri, film);
    }
  }
  if (hintHits.size === 1) return [...hintHits.values()][0]!;
  return null;
}

function filmsMatching(
  films: QueueFilm[],
  candidate: { title: string; year: number | null },
): QueueFilm[] {
  return films.filter((film) =>
    titlesLikelyMatch(candidate, { title: film.title, year: film.year }),
  );
}

function mergeMatchesByUri(matches: ReadwiseMatch[]): ReadwiseMatch[] {
  const byUri = new Map<string, ReadwiseMatch>();
  for (const match of matches) {
    const prev = byUri.get(match.letterboxdUri);
    if (!prev) {
      byUri.set(match.letterboxdUri, match);
      continue;
    }
    byUri.set(match.letterboxdUri, {
      ...prev,
      highlights: [...prev.highlights, ...match.highlights],
    });
  }
  return [...byUri.values()];
}

export function highlightCountsByUri(matches: ReadwiseMatch[]): Map<string, number> {
  return new Map(matches.map((match) => [match.letterboxdUri, match.highlights.length]));
}
