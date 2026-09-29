import { describe, expect, it } from "vitest";
import { filmsFromTmdbPayload, requestFilm, searchTmdbMovies } from "../api/src/titleRequests.js";
import { findCatalogMovie } from "../src/lib/content/titleRequests.js";
import type { CatalogEntry } from "../src/types/content.js";

function entry(partial: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "title">): CatalogEntry {
  return {
    lineCount: 10,
    sourceFilename: "x.srt",
    importedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("catalog movie match", () => {
  const entries = [
    entry({ id: "baby-driver-2017", title: "Baby Driver (2017)", meta: { year: 2017 } }),
    entry({
      id: "the-simpsons---4x01---kamp-krusty",
      title: "The Simpsons - 4x01 - Kamp Krusty",
      meta: { show: "The Simpsons", season: 4, episode: 1 },
    }),
  ];

  it("opens a movie with the same title and year", () => {
    expect(findCatalogMovie(entries, "Baby Driver", 2017)?.id).toBe("baby-driver-2017");
    expect(findCatalogMovie(entries, "The Baby Driver", 2017)?.id).toBe("baby-driver-2017");
  });

  it("does not treat a different year or a show as the same film", () => {
    expect(findCatalogMovie(entries, "Baby Driver", 2016)).toBeNull();
    expect(findCatalogMovie(entries, "The Simpsons", 1992)).toBeNull();
  });
});

describe("tmdb search payload", () => {
  it("keeps movies that have a title and year", () => {
    const films = filmsFromTmdbPayload({
      results: [
        { id: 27205, title: "Inception", release_date: "2010-07-16" },
        { id: 1, title: "Untitled", release_date: "" },
      ],
    });
    expect(films).toEqual([{ tmdbId: 27205, title: "Inception", year: 2010 }]);
  });

  it("refuses to search without an API key", async () => {
    const result = await searchTmdbMovies(undefined, "inception", fetch);
    expect(result).toEqual({ error: "Movie search is not configured", status: 503 });
  });
});

describe("title request insert", () => {
  it("inserts once for the same person and film", async () => {
    const films = new Set<number>([27205]);
    const requests = new Set<string>();
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM tmdb_films")) {
                  const [id] = args as [number];
                  return films.has(id) ? { tmdb_id: id } : null;
                }
                return null;
              },
              async run() {
                const [userId, tmdbId] = args as [string, number];
                const key = `${userId}:${tmdbId}`;
                if (requests.has(key)) return { meta: { changes: 0 } };
                requests.add(key);
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const first = await requestFilm(db, "alice", 27205);
    const second = await requestFilm(db, "alice", 27205);
    const unknown = await requestFilm(db, "alice", 999);
    expect(first).toEqual({ created: true });
    expect(second).toEqual({ created: false });
    expect(unknown).toEqual({ error: "Search for that movie first", status: 400 });
  });
});
