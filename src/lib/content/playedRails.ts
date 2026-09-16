import type { CatalogEntry } from "../../types/content.js";
import type { StoredRun } from "../runs/api.js";
import { catalogLabel, groupCatalogEntries } from "./libraryGroups.js";

export type PlayedMovie = {
  entry: CatalogEntry;
  playCount: number;
};

export type PlayedShow = {
  show: string;
  playCount: number;
  episodeCount: number;
};

export type PersonalGameStats = {
  gamesPlayed: number;
  linesGuessed: number;
  titlesTouched: number;
  mostPlayed: { label: string; playCount: number }[];
};

const RAIL_LIMIT = 5;

export function topPlayedMovies(
  entries: CatalogEntry[],
  counts: Map<string, number>,
  limit = RAIL_LIMIT,
): PlayedMovie[] {
  const { movies } = groupCatalogEntries(entries);
  return movies
    .map((entry) => ({ entry, playCount: counts.get(entry.id) ?? 0 }))
    .filter((row) => row.playCount > 0)
    .sort((a, b) => b.playCount - a.playCount || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit);
}

export function topPlayedShows(
  entries: CatalogEntry[],
  counts: Map<string, number>,
  limit = RAIL_LIMIT,
): PlayedShow[] {
  const { shows } = groupCatalogEntries(entries);
  return shows
    .map((show) => {
      let playCount = 0;
      for (const episodes of show.seasons.values()) {
        for (const entry of episodes) {
          playCount += counts.get(entry.id) ?? 0;
        }
      }
      return { show: show.show, playCount, episodeCount: show.episodeCount };
    })
    .filter((row) => row.playCount > 0)
    .sort((a, b) => b.playCount - a.playCount || a.show.localeCompare(b.show))
    .slice(0, limit);
}

export function playCountMap(rows: { titleId: string; playCount: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.titleId, row.playCount);
  }
  return map;
}

/** Personal play counts per catalog title, highest first. */
export function yourTopPlayed(
  runs: StoredRun[],
  entries: CatalogEntry[],
  limit = RAIL_LIMIT,
): PlayedMovie[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const counts = new Map<string, number>();
  for (const run of runs) {
    counts.set(run.titleId, (counts.get(run.titleId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([titleId, playCount]) => {
      const entry = byId.get(titleId);
      return entry ? { entry, playCount } : null;
    })
    .filter((row): row is PlayedMovie => row != null)
    .sort((a, b) => b.playCount - a.playCount || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit);
}

/** Newest-first unique titles from the player's runs (skip unknown catalog ids). */
export function recentFromRuns(
  runs: StoredRun[],
  entries: CatalogEntry[],
  limit = RAIL_LIMIT,
): CatalogEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const recent: CatalogEntry[] = [];

  const ordered = [...runs].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  for (const run of ordered) {
    if (seen.has(run.titleId)) continue;
    const entry = byId.get(run.titleId);
    if (!entry) continue;
    seen.add(run.titleId);
    recent.push(entry);
    if (recent.length >= limit) break;
  }
  return recent;
}

export function summarizeRuns(runs: StoredRun[], entries: CatalogEntry[]): PersonalGameStats {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const titles = new Set(runs.map((run) => run.titleId));
  const grouped = new Map<string, number>();

  for (const run of runs) {
    const entry = byId.get(run.titleId);
    const key = entry?.meta?.show?.trim() || (entry ? catalogLabel(entry) : run.titleId);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  const mostPlayed = [...grouped.entries()]
    .map(([label, playCount]) => ({ label, playCount }))
    .sort((a, b) => b.playCount - a.playCount || a.label.localeCompare(b.label))
    .slice(0, RAIL_LIMIT);

  return {
    gamesPlayed: runs.length,
    linesGuessed: runs.reduce((sum, run) => sum + run.correctCount, 0),
    titlesTouched: titles.size,
    mostPlayed,
  };
}

export function historyTitleLabel(titleId: string, entries: CatalogEntry[]): string {
  const entry = entries.find((item) => item.id === titleId);
  return entry ? catalogLabel(entry) : titleId;
}
