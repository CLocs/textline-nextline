import stillsCoverageJson from "../../../content/stills-coverage.json";
import type { CatalogEntry } from "../../types/content.js";
import { groupCatalogEntries } from "../content/libraryGroups.js";

type CoverageFile = { titles?: Record<string, number> };

/** Titles that have at least one extracted still. */
export function framedTitleIds(
  coverage: Record<string, number> = (stillsCoverageJson as CoverageFile).titles ?? {},
): Set<string> {
  const ids = new Set<string>();
  for (const [id, count] of Object.entries(coverage)) {
    if (typeof count === "number" && count > 0) ids.add(id);
  }
  return ids;
}

export function framedMovies(entries: CatalogEntry[], framed: Set<string>): CatalogEntry[] {
  return groupCatalogEntries(entries).movies.filter((entry) => framed.has(entry.id));
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j]!;
    copy[j] = swap!;
  }
  return copy;
}

/**
 * Up to `count` movies that have frames.
 * The previous draw is skipped when enough other movies remain.
 */
export function sampleFramedMovies(
  movies: CatalogEntry[],
  avoid: readonly string[],
  count: number,
  rng: () => number = Math.random,
): CatalogEntry[] {
  if (count <= 0 || movies.length === 0) return [];
  const skipped = new Set(avoid);
  const fresh = movies.filter((movie) => !skipped.has(movie.id));
  const pool = fresh.length >= Math.min(count, movies.length) ? fresh : movies;
  return shuffle(pool, rng).slice(0, Math.min(count, pool.length));
}

/** Replace the movie just played. The other card stays. If nothing else is left, the pair stays. */
export function rotatePlayedMovie(
  movies: CatalogEntry[],
  pair: readonly CatalogEntry[],
  playedId: string,
  rng: () => number = Math.random,
): CatalogEntry[] {
  const index = pair.findIndex((movie) => movie.id === playedId);
  if (index < 0) return [...pair];
  const avoid = pair.map((movie) => movie.id);
  const [next] = sampleFramedMovies(movies, avoid, 1, rng);
  if (!next || avoid.includes(next.id)) return [...pair];
  const updated = [...pair];
  updated[index] = next;
  return updated;
}
