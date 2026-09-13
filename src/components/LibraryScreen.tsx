import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getPlayableLines } from "../lib/content/playable";
import {
  episodeLabel,
  groupCatalogEntries,
  type ShowGroup,
} from "../lib/content/libraryGroups";
import { fetchPlayedStats } from "../lib/runs/api";
import { playCountMap, topPlayedMovies, topPlayedShows } from "../lib/content/playedRails";

type Props = {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
};

type View =
  | { level: "root" }
  | { level: "show"; show: string }
  | { level: "season"; show: string; season: number };

function dialogueLineCount(entry: CatalogEntry): number {
  const title = getTitle(entry.id);
  return title ? getPlayableLines(title).length : entry.lineCount;
}

function findShow(groups: ReturnType<typeof groupCatalogEntries>, show: string): ShowGroup | undefined {
  return groups.shows.find((g) => g.show === show);
}

export function LibraryScreen({ entries, onSelect }: Props) {
  const [view, setView] = useState<View>({ level: "root" });
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const groups = groupCatalogEntries(entries);

  useEffect(() => {
    let cancelled = false;
    void fetchPlayedStats().then((titles) => {
      if (!cancelled) setCounts(playCountMap(titles));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const playedMovies = useMemo(() => topPlayedMovies(entries, counts), [entries, counts]);
  const playedShows = useMemo(() => topPlayedShows(entries, counts), [entries, counts]);
  const showRails = playedMovies.length > 0 || playedShows.length > 0;

  if (view.level === "season") {
    const show = findShow(groups, view.show);
    const episodes = show?.seasons.get(view.season) ?? [];
    return (
      <section className="panel">
        <div className="section-header">
          <button type="button" className="button ghost back-link" onClick={() => setView({ level: "show", show: view.show })}>
            ← {view.show}
          </button>
          <h2>Season {view.season}</h2>
          <p className="muted">{episodes.length} episode{episodes.length === 1 ? "" : "s"}</p>
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
    const seasons = show
      ? [...show.seasons.keys()].sort((a, b) => a - b)
      : [];
    return (
      <section className="panel">
        <div className="section-header">
          <button type="button" className="button ghost back-link" onClick={() => setView({ level: "root" })}>
            ← Library
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
                  onClick={() => setView({ level: "season", show: view.show, season })}
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

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Library</h2>
        <p className="muted">Movies and TV from your curated transcripts.</p>
      </div>

      {entries.length === 0 ? (
        <p className="empty">
          No titles imported yet. Run <code>npm run import:all</code>.
        </p>
      ) : (
        <div className="library-groups">
          {showRails && playedMovies.length > 0 && (
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

          {showRails && playedShows.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Top played shows</h3>
              <ul className="title-list">
                {playedShows.map((show) => (
                  <li key={show.show}>
                    <button
                      type="button"
                      className="title-card"
                      onClick={() => setView({ level: "show", show: show.show })}
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
                      onClick={() => setView({ level: "show", show: show.show })}
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
