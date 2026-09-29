import type { CatalogEntry } from "../../types/content.js";
import { normalizeTitle, parseTitleYear } from "./titleMatch.js";

export type RequestableFilm = {
  tmdbId: number;
  title: string;
  year: number;
};

export function catalogMovieYear(entry: CatalogEntry): number | null {
  if (entry.meta?.show) return null;
  if (typeof entry.meta?.year === "number" && entry.meta.year > 0) return entry.meta.year;
  const parsed = parseTitleYear(entry.title);
  if (parsed.year) return parsed.year;
  const fromId = entry.id.match(/-(\d{4})$/);
  return fromId ? Number(fromId[1]) : null;
}

/** A catalog movie with the same normalized title and year. Shows are skipped. */
export function findCatalogMovie(
  entries: CatalogEntry[],
  title: string,
  year: number,
): CatalogEntry | null {
  const want = normalizeTitle(parseTitleYear(title).title || title);
  if (!want) return null;
  for (const entry of entries) {
    if (entry.meta?.show) continue;
    if (catalogMovieYear(entry) !== year) continue;
    const parsed = parseTitleYear(entry.title);
    const names = [normalizeTitle(parsed.title), normalizeTitle(entry.title)];
    if (names.includes(want)) return entry;
  }
  return null;
}
