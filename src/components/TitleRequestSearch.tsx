import { useEffect, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession, isLoggedIn } from "../lib/auth/session";
import { findCatalogMovie, type RequestableFilm } from "../lib/content/titleRequests";
import { requestMovie, searchRequestableMovies } from "../lib/content/titleRequestsApi";

type Props = {
  query: string;
  entries: CatalogEntry[];
  onOpenTitle: (entry: CatalogEntry) => void;
};

export function TitleRequestSearch({ query, entries, onOpenTitle }: Props) {
  const live = isAuthApiEnabled() && isLoggedIn() && !isLocalDevSession();
  const [films, setFilms] = useState<RequestableFilm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void searchRequestableMovies(query).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setFilms([]);
        setError(result.error);
        return;
      }
      setFilms(result);
    });
    return () => {
      cancelled = true;
    };
  }, [live, query]);

  async function handleRequest(film: RequestableFilm) {
    setBusyId(film.tmdbId);
    setError(null);
    const result = await requestMovie(film.tmdbId);
    setBusyId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotes((current) => ({
      ...current,
      [film.tmdbId]: result.created ? "Requested" : "Already queued",
    }));
  }

  return (
    <div className="search-section">
      <h3 className="search-section-title">Request a movie</h3>
      {!live ? (
        <p className="muted">Sign in on the live API to request a movie.</p>
      ) : loading ? (
        <p className="muted">Searching movies…</p>
      ) : films.length === 0 ? (
        <p className="muted">{error ?? "No movies found."}</p>
      ) : (
        <ul className="search-list">
          {films.map((film) => {
            const catalog = findCatalogMovie(entries, film.title, film.year);
            const note = notes[film.tmdbId];
            return (
              <li key={film.tmdbId} className="title-request-row">
                <span className="search-hit-label">
                  {film.title} ({film.year})
                </span>
                {catalog ? (
                  <button type="button" className="button ghost" onClick={() => onOpenTitle(catalog)}>
                    Open
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busyId === film.tmdbId || Boolean(note)}
                    onClick={() => void handleRequest(film)}
                  >
                    {note ?? (busyId === film.tmdbId ? "Requesting…" : "Request")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {live && films.length > 0 && error ? (
        <p className="feedback wrong" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
