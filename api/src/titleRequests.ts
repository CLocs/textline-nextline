export type RequestableFilm = {
  tmdbId: number;
  title: string;
  year: number;
};

export type TitleRequestRow = RequestableFilm & {
  displayName: string;
  createdAt: string;
};

const SEARCH_LIMIT = 8;

type TmdbMovie = {
  id?: unknown;
  title?: unknown;
  release_date?: unknown;
};

export function filmsFromTmdbPayload(payload: unknown): RequestableFilm[] {
  if (!payload || typeof payload !== "object" || !("results" in payload)) return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const films: RequestableFilm[] = [];
  for (const row of results) {
    const film = filmFromTmdb(row as TmdbMovie);
    if (film) films.push(film);
    if (films.length >= SEARCH_LIMIT) break;
  }
  return films;
}

function filmFromTmdb(row: TmdbMovie): RequestableFilm | null {
  const tmdbId = typeof row.id === "number" && Number.isInteger(row.id) ? row.id : 0;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const release = typeof row.release_date === "string" ? row.release_date : "";
  const year = Number(release.slice(0, 4));
  if (tmdbId <= 0 || !title || !Number.isInteger(year) || year < 1880) return null;
  return { tmdbId, title, year };
}

export async function searchTmdbMovies(
  apiKey: string | undefined,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RequestableFilm[] | { error: string; status: number }> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return { error: "Enter at least 2 characters", status: 400 };
  const key = apiKey?.trim();
  if (!key) return { error: "Movie search is not configured", status: 503 };
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", q);
  url.searchParams.set("include_adult", "false");
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { error: "Movie search is unavailable", status: 502 };
  }
  if (!response.ok) return { error: "Movie search is unavailable", status: 502 };
  const payload = (await response.json().catch(() => null)) as unknown;
  return filmsFromTmdbPayload(payload);
}

export async function rememberFilms(db: D1Database, films: RequestableFilm[]): Promise<void> {
  for (const film of films) {
    await db
      .prepare(
        `INSERT INTO tmdb_films (tmdb_id, title, year) VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id) DO UPDATE SET title = excluded.title, year = excluded.year`,
      )
      .bind(film.tmdbId, film.title, film.year)
      .run();
  }
}

export async function requestFilm(
  db: D1Database,
  userId: string,
  tmdbId: number,
): Promise<{ created: boolean } | { error: string; status: number }> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { error: "Unknown movie", status: 400 };
  }
  const known = await db
    .prepare(`SELECT tmdb_id FROM tmdb_films WHERE tmdb_id = ?`)
    .bind(tmdbId)
    .first<{ tmdb_id: number }>();
  if (!known) return { error: "Search for that movie first", status: 400 };
  const inserted = await db
    .prepare(
      `INSERT INTO title_requests (user_id, tmdb_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, tmdb_id) DO NOTHING`,
    )
    .bind(userId, tmdbId, new Date().toISOString())
    .run();
  return { created: (inserted.meta?.changes ?? 0) > 0 };
}

export async function listTitleRequests(db: D1Database): Promise<TitleRequestRow[]> {
  const result = await db
    .prepare(
      `SELECT u.display_name, f.title, f.year, r.tmdb_id, r.created_at
       FROM title_requests r
       JOIN users u ON u.id = r.user_id
       JOIN tmdb_films f ON f.tmdb_id = r.tmdb_id
       ORDER BY r.created_at DESC
       LIMIT 200`,
    )
    .all<{
      display_name: string | null;
      title: string;
      year: number;
      tmdb_id: number;
      created_at: string;
    }>();
  return (result.results ?? []).map((row) => ({
    displayName: row.display_name?.trim() || "A player",
    title: row.title,
    year: row.year,
    tmdbId: row.tmdb_id,
    createdAt: row.created_at,
  }));
}
