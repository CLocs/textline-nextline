import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getPlayableLines } from "../lib/content/playable";
import {
  catalogLabel,
  episodeLabel,
  groupCatalogEntries,
  type ShowGroup,
} from "../lib/content/libraryGroups";
import { fetchMyRuns, fetchPlayedStats } from "../lib/runs/api";
import {
  playCountMap,
  recentFromRuns,
  topPlayedMovies,
  topPlayedShows,
} from "../lib/content/playedRails";

type Props = {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
};

type View =
  | { level: "home" }
  | { level: "browse" }
  | { level: "show"; show: string; from: "home" | "browse" }
  | { level: "season"; show: string; season: number; from: "home" | "browse" };

function dialogueLineCount(entry: CatalogEntry): number {
  const title = getTitle(entry.id);
  return title ? getPlayableLines(title).length : entry.lineCount;
}

function findShow(groups: ReturnType<typeof groupCatalogEntries>, show: string): ShowGroup | undefined {
  return groups.shows.find((g) => g.show === show);
}

export function LibraryScreen({ entries, onSelect }: Props) {
  const [view, setView] = useState<View>({ level: "home" });
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<CatalogEntry[]>([]);
  const groups = groupCatalogEntries(entries);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchPlayedStats(), fetchMyRuns()]).then(([titles, runs]) => {
      if (cancelled) return;
      setCounts(playCountMap(titles));
      setRecent(recentFromRuns(runs, entries));
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const playedMovies = useMemo(() => topPlayedMovies(entries, counts), [entries, counts]);
  const playedShows = useMemo(() => topPlayedShows(entries, counts), [entries, counts]);
  const showHomeRails =
    recent.length > 0 || playedMovies.length > 0 || playedShows.length > 0;

  if (view.level === "season") {
    const show = findShow(groups, view.show);
    const episodes = show?.seasons.get(view.season) ?? [];
    return (
      <section className="panel">
        <div className="section-header">
          <button
            type="button"
            className="button ghost back-link"
            onClick={() => setView({ level: "show", show: view.show, from: view.from })}
          >
            ← {view.show}
          </button>
          <h2>Season {view.season}</h2>
          <p className="muted">
            {episodes.length} episode{episodes.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="title-list">
          {episodes.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="title-card" onClick={() => onSelect(entry)}>
                <span className="title-card-name">{episodeLabel(entry)}</span>
                <span className="title-card-meta">{dialogueLineCount(entry)} lines</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (view.level === "show") {
    const show = findShow(groups, view.show);
    const seasons = show ? [...show.seasons.keys()].sort((a, b) => a - b) : [];
    const backLabel = view.from === "home" ? "Home" : "Library";
    return (
      <section className="panel">
        <div className="section-header">
          <button
            type="button"
            className="button ghost back-link"
            onClick={() => setView({ level: view.from })}
          >
            ← {backLabel}
          </button>
          <h2>{view.show}</h2>
          <p className="muted">
            {show?.episodeCount ?? 0} episode{(show?.episodeCount ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="title-list">
          {seasons.map((season) => {
            const count = show?.seasons.get(season)?.length ?? 0;
            return (
              <li key={season}>
                <button
                  type="button"
                  className="title-card"
                  onClick={() =>
                    setView({ level: "season", show: view.show, season, from: view.from })
                  }
                >
                  <span className="title-card-name">Season {season}</span>
                  <span className="title-card-meta">
                    {count} episode{count === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (view.level === "browse") {
    return (
      <section className="panel">
        <div className="section-header">
          <button
            type="button"
            className="button ghost back-link"
            onClick={() => setView({ level: "home" })}
          >
            ← Home
          </button>
          <h2>Library</h2>
          <p className="muted">Browse every movie and episode in the catalog.</p>
        </div>

        {entries.length === 0 ? (
          <p className="empty">
            No titles imported yet. Run <code>npm run import:all</code>.
          </p>
        ) : (
          <div className="library-groups">
            {groups.movies.length > 0 && (
              <div className="library-group">
                <h3 className="library-group-heading">Movies</h3>
                <ul className="title-list">
                  {groups.movies.map((entry) => (
                    <li key={entry.id}>
                      <button type="button" className="title-card" onClick={() => onSelect(entry)}>
                        <span className="title-card-name">{entry.title}</span>
                        <span className="title-card-meta">{dialogueLineCount(entry)} lines</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groups.shows.length > 0 && (
              <div className="library-group">
                <h3 className="library-group-heading">TV Shows</h3>
                <ul className="title-list">
                  {groups.shows.map((show) => (
                    <li key={show.show}>
                      <button
                        type="button"
                        className="title-card"
                        onClick={() => setView({ level: "show", show: show.show, from: "browse" })}
                      >
                        <span className="title-card-name">{show.show}</span>
                        <span className="title-card-meta">
                          {show.episodeCount} episode{show.episodeCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Home</h2>
        <p className="muted">Pick up where you left off, or browse the full library.</p>
      </div>

      {entries.length === 0 ? (
        <p className="empty">
          No titles imported yet. Run <code>npm run import:all</code>.
        </p>
      ) : (
        <div className="library-groups">
          {recent.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Your recent</h3>
              <ul className="title-list">
                {recent.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="title-card" onClick={() => onSelect(entry)}>
                      <span className="title-card-name">{catalogLabel(entry)}</span>
                      <span className="title-card-meta">{dialogueLineCount(entry)} lines</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showHomeRails && playedMovies.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Top played movies</h3>
              <ul className="title-list">
                {playedMovies.map(({ entry, playCount }) => (
                  <li key={entry.id}>
                    <button type="button" className="title-card" onClick={() => onSelect(entry)}>
                      <span className="title-card-name">{entry.title}</span>
                      <span className="title-card-meta">
                        {playCount} play{playCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showHomeRails && playedShows.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Top played shows</h3>
              <ul className="title-list">
                {playedShows.map((show) => (
                  <li key={show.show}>
                    <button
                      type="button"
                      className="title-card"
                      onClick={() => setView({ level: "show", show: show.show, from: "home" })}
                    >
                      <span className="title-card-name">{show.show}</span>
                      <span className="title-card-meta">
                        {show.playCount} play{show.playCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!showHomeRails && (
            <p className="muted home-empty-rails">
              Play a few games and your recent titles plus crowd favorites show up here.
            </p>
          )}

          <div className="home-browse-row">
            <button
              type="button"
              className="button primary"
              onClick={() => setView({ level: "browse" })}
            >
              Browse full library
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
