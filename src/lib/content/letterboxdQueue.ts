import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv.js";
import { letterboxdFilmKey, titlesLikelyMatch } from "./titleMatch.js";
import type { ContentQueue, QueueFilm } from "../../types/contentQueue.js";

const SKIP_EXPORT_DIRS = new Set(["orphaned", "deleted"]);

export const SEED_LABEL = "likes ∪ ratings>=4.5" as const;
export const RATING_THRESHOLD = 4.5;

export type FilmRow = {
  title: string;
  year: number | null;
  letterboxdUri: string;
};

export type RatingRow = FilmRow & { rating: number };

export type SeedStats = {
  liked: number;
  highRated: number;
  unique: number;
  newCount: number;
};

type StatusFields = Pick<QueueFilm, "tmdbId" | "srt" | "converted" | "imported">;

const EMPTY_STATUS: StatusFields = {
  tmdbId: null,
  srt: "missing",
  converted: false,
  imported: false,
};

/** 1 = 5★ + liked … 5 = liked with no rating. Lower is first. */
export function priorityRank(liked: boolean, rating: number | null): number {
  if (rating === 5 && liked) return 1;
  if (rating === 5) return 2;
  if (rating !== null && rating >= RATING_THRESHOLD && liked) return 3;
  if (rating !== null && rating >= RATING_THRESHOLD) return 4;
  if (liked) return 5;
  return 6;
}

export function parseLikesCsv(text: string): FilmRow[] {
  return parseCsv(text)
    .map(rowToFilm)
    .filter((row): row is FilmRow => row !== null);
}

export function parseRatingsCsv(text: string): RatingRow[] {
  const rows: RatingRow[] = [];
  for (const record of parseCsv(text)) {
    const film = rowToFilm(record);
    if (!film) continue;
    const rating = parseRating(record.Rating ?? record.rating);
    if (rating === null) continue;
    rows.push({ ...film, rating });
  }
  return rows;
}

function rowToFilm(record: Record<string, string>): FilmRow | null {
  const title = (record.Name ?? record.name ?? "").trim();
  const letterboxdUri = (record["Letterboxd URI"] ?? record.letterboxdUri ?? "").trim();
  if (!title || !letterboxdUri) return null;
  const yearRaw = (record.Year ?? record.year ?? "").trim();
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;
  return {
    title,
    year: Number.isFinite(year) ? year : null,
    letterboxdUri: normalizeUri(letterboxdUri),
  };
}

function parseRating(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeUri(uri: string): string {
  return uri.replace(/\/+$/, "");
}

export function parseDiaryCsv(text: string): FilmRow[] {
  return parseCsv(text)
    .map(rowToFilm)
    .filter((row): row is FilmRow => row !== null);
}

/** Count diary rows per Name+Year (each log, including rewatches, is one play). */
export function playCountsFromDiary(rows: FilmRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = letterboxdFilmKey(row.title, row.year);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function attachPlayCounts(films: QueueFilm[], counts: Map<string, number>): void {
  for (const film of films) {
    film.playCount = counts.get(letterboxdFilmKey(film.title, film.year)) ?? 0;
  }
}

export function attachHighlightCounts(films: QueueFilm[], counts: Map<string, number>): void {
  for (const film of films) {
    film.highlightCount = counts.get(film.letterboxdUri) ?? 0;
  }
}

export function markFilmsImported(
  films: QueueFilm[],
  imported: { title: string; year: number | null }[],
): number {
  let n = 0;
  for (const film of films) {
    const hit = imported.some((title) =>
      titlesLikelyMatch(
        { title: film.title, year: film.year },
        { title: title.title, year: title.year },
      ),
    );
    if (!hit) continue;
    if (film.srt === "missing") film.srt = "manual";
    film.converted = true;
    film.imported = true;
    n += 1;
  }
  return n;
}

export function seedFromExport(likes: FilmRow[], ratings: RatingRow[]): QueueFilm[] {
  const highRated = ratings.filter((row) => row.rating >= RATING_THRESHOLD);
  const byUri = new Map<string, QueueFilm>();

  for (const like of likes) {
    byUri.set(like.letterboxdUri, filmFromParts(like, true, null));
  }

  for (const row of highRated) {
    const existing = byUri.get(row.letterboxdUri);
    if (existing) {
      existing.rating = row.rating;
      existing.title = row.title || existing.title;
      existing.year = row.year ?? existing.year;
      existing.priority = priorityRank(true, row.rating);
    } else {
      byUri.set(row.letterboxdUri, filmFromParts(row, false, row.rating));
    }
  }

  // A like that also appears in ratings.csv below the threshold still keeps liked:true
  // and may pick up a rating for display even though the rating alone wouldn't seed it.
  for (const row of ratings) {
    const existing = byUri.get(row.letterboxdUri);
    if (existing && existing.rating === null) {
      existing.rating = row.rating;
      existing.priority = priorityRank(existing.liked, row.rating);
    }
  }

  return [...byUri.values()];
}

export function filmFromParts(row: FilmRow, liked: boolean, rating: number | null): QueueFilm {
  return {
    title: row.title,
    year: row.year,
    letterboxdUri: row.letterboxdUri,
    liked,
    rating,
    priority: priorityRank(liked, rating),
    playCount: 0,
    highlightCount: 0,
    ...EMPTY_STATUS,
  };
}

export function mergeQueue(
  existing: QueueFilm[],
  incoming: QueueFilm[],
): { films: QueueFilm[]; newCount: number } {
  const byUri = new Map(existing.map((film) => [film.letterboxdUri, film]));
  let newCount = 0;

  for (const next of incoming) {
    const prev = byUri.get(next.letterboxdUri);
    if (!prev) {
      byUri.set(next.letterboxdUri, next);
      newCount++;
      continue;
    }
    byUri.set(next.letterboxdUri, {
      ...next,
      tmdbId: prev.tmdbId,
      srt: prev.srt,
      converted: prev.converted,
      imported: prev.imported,
    });
  }

  return { films: [...byUri.values()], newCount };
}

export function sortQueueStable(films: QueueFilm[]): QueueFilm[] {
  return [...films].sort((a, b) => {
    const yearA = a.year ?? 9999;
    const yearB = b.year ?? 9999;
    if (yearA !== yearB) return yearA - yearB;
    return a.title.localeCompare(b.title);
  });
}

export function sortQueueByPriority(films: QueueFilm[]): QueueFilm[] {
  return [...films].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.playCount !== b.playCount) return b.playCount - a.playCount;
    if (a.highlightCount !== b.highlightCount) return b.highlightCount - a.highlightCount;
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    if (ratingA !== ratingB) return ratingB - ratingA;
    return a.title.localeCompare(b.title);
  });
}

export function buildQueue(films: QueueFilm[], updatedAt = new Date()): ContentQueue {
  return {
    version: 1,
    updatedAt: updatedAt.toISOString(),
    seed: SEED_LABEL,
    films: sortQueueStable(films),
  };
}

export function parseQueueFile(raw: unknown): ContentQueue {
  if (!raw || typeof raw !== "object") {
    throw new Error("Expected a queue JSON object.");
  }
  const data = raw as ContentQueue;
  if (data.version !== 1 || !Array.isArray(data.films)) {
    throw new Error("Invalid content queue (need version 1 and films[]).");
  }
  return data;
}

export function loadQueueFromDir(dir: string): { incoming: QueueFilm[]; stats: Omit<SeedStats, "newCount"> } {
  const likesPath = findExportFile(dir, ["likes", "films.csv"]) ?? findExportFile(dir, ["films.csv"]);
  const ratingsPath = findExportFile(dir, ["ratings.csv"]);

  if (!likesPath && !ratingsPath) {
    throw new Error(
      `No likes/films.csv or ratings.csv under ${dir}. Pass the Letterboxd ZIP or the extracted folder.`,
    );
  }

  const likes = likesPath ? parseLikesCsv(readFileSync(likesPath, "utf8")) : [];
  const ratings = ratingsPath ? parseRatingsCsv(readFileSync(ratingsPath, "utf8")) : [];
  const incoming = seedFromExport(likes, ratings);
  const diaryPath = findExportFile(dir, ["diary.csv"]);
  if (diaryPath) {
    attachPlayCounts(incoming, playCountsFromDiary(parseDiaryCsv(readFileSync(diaryPath, "utf8"))));
  }
  const highRated = ratings.filter((row) => row.rating >= RATING_THRESHOLD).length;

  return {
    incoming,
    stats: { liked: likes.length, highRated, unique: incoming.length },
  };
}

export function formatQueueMarkdown(films: QueueFilm[]): string {
  const lines = [
    "# Content queue",
    "",
    `Seed: **${SEED_LABEL}**. Sorted by priority, then diary play count, then Readwise highlights. Check off as SRTs land in \`inbox/srt/\`.`,
    "",
    "| Pri | Plays | HLs | Title | Year | Rating | Liked | SRT |",
    "|-----|-------|-----|-------|------|--------|-------|-----|",
  ];

  for (const film of sortQueueByPriority(films)) {
    const year = film.year ?? "";
    const rating = film.rating ?? "—";
    const liked = film.liked ? "yes" : "";
    lines.push(
      `| ${film.priority} | ${film.playCount} | ${film.highlightCount} | [${escapeMd(film.title)}](${film.letterboxdUri}) | ${year} | ${rating} | ${liked} | ${film.srt} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export function findExportFile(root: string, parts: string[]): string | null {
  const direct = join(root, ...parts);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  const matches: string[] = [];
  walkFiles(root, 0, 5, (filePath) => {
    const normalized = filePath.replaceAll("\\", "/").toLowerCase();
    const needle = parts.join("/").toLowerCase();
    if (normalized.endsWith("/" + needle) || normalized.endsWith(needle)) {
      matches.push(filePath);
    }
  });
  matches.sort((a, b) => a.split(/[/\\]/).length - b.split(/[/\\]/).length);
  return matches[0] ?? null;
}

function walkFiles(
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
    if (SKIP_EXPORT_DIRS.has(name.toLowerCase())) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walkFiles(full, depth + 1, maxDepth, visit);
    else visit(full);
  }
}
