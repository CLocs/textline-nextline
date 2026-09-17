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
  yourTopPlayed,
} from "../lib/content/playedRails";
import { coverStillForShow, coverStillLineIndex } from "../lib/content/stillsCover";
import { PosterArt } from "./PosterArt";

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

function TitleCard({
  name,
  meta,
  stillTitleId,
  stillTitle,
  onClick,
}: {
  name: string;
  meta: string;
  stillTitleId?: string;
  stillTitle?: string;
  onClick: () => void;
}) {
  const lineIndex = stillTitleId ? coverStillLineIndex(stillTitleId) : undefined;
  return (
    <button type="button" className="title-card" onClick={onClick}>
      {stillTitleId != null && lineIndex != null ? (
        <PosterArt
          titleId={stillTitleId}
          title={stillTitle ?? name}
          lineIndex={lineIndex}
          fallback="hide"
          className="title-card-still"
        />
      ) : null}
      <span className="title-card-copy">
        <span className="title-card-name">{name}</span>
        <span className="title-card-meta">{meta}</span>
      </span>
    </button>
  );
}

export function LibraryScreen({ entries, onSelect }: Props) {
  const [view, setView] = useState<View>({ level: "home" });
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<CatalogEntry[]>([]);
  const [yours, setYours] = useState<ReturnType<typeof yourTopPlayed>>([]);
  const [railsReady, setRailsReady] = useState(false);
  const groups = groupCatalogEntries(entries);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchPlayedStats(), fetchMyRuns()]).then(([titles, runs]) => {
      if (cancelled) return;
      setCounts(playCountMap(titles));
      setRecent(recentFromRuns(runs, entries));
      setYours(yourTopPlayed(runs, entries));
      setRailsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const playedMovies = useMemo(() => topPlayedMovies(entries, counts), [entries, counts]);
  const playedShows = useMemo(() => topPlayedShows(entries, counts), [entries, counts]);
  const hasPersonalRails = recent.length > 0 || yours.length > 0;
  const hasCrowdRails = playedMovies.length > 0 || playedShows.length > 0;

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
              <TitleCard
                name={episodeLabel(entry)}
                meta={`${dialogueLineCount(entry)} lines`}
                stillTitleId={entry.id}
                stillTitle={entry.title}
                onClick={() => onSelect(entry)}
              />
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
                      <TitleCard
                        name={entry.title}
                        meta={`${dialogueLineCount(entry)} lines`}
                        stillTitleId={entry.id}
                        stillTitle={entry.title}
                        onClick={() => onSelect(entry)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groups.shows.length > 0 && (
              <div className="library-group">
                <h3 className="library-group-heading">TV Shows</h3>
                <ul className="title-list">
                  {groups.shows.map((show) => {
                    const cover = coverStillForShow(show);
                    return (
                    <li key={show.show}>
                      <TitleCard
                        name={show.show}
                        meta={`${show.episodeCount} episode${show.episodeCount === 1 ? "" : "s"}`}
                        stillTitleId={cover?.titleId}
                        stillTitle={show.show}
                        onClick={() => setView({ level: "show", show: show.show, from: "browse" })}
                      />
                    </li>
                    );
                  })}
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
        <p className="muted">Your games, then what everyone else is playing.</p>
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
                    <TitleCard
                      name={catalogLabel(entry)}
                      meta={`${dialogueLineCount(entry)} lines`}
                      stillTitleId={entry.id}
                      stillTitle={entry.title}
                      onClick={() => onSelect(entry)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {yours.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Your top played</h3>
              <ul className="title-list">
                {yours.map(({ entry, playCount }) => (
                  <li key={entry.id}>
                    <TitleCard
                      name={catalogLabel(entry)}
                      meta={`${playCount} play${playCount === 1 ? "" : "s"}`}
                      stillTitleId={entry.id}
                      stillTitle={entry.title}
                      onClick={() => onSelect(entry)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {playedMovies.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Top movies · everyone</h3>
              <ul className="title-list">
                {playedMovies.map(({ entry, playCount }) => (
                  <li key={entry.id}>
                    <TitleCard
                      name={entry.title}
                      meta={`${playCount} play${playCount === 1 ? "" : "s"}`}
                      stillTitleId={entry.id}
                      stillTitle={entry.title}
                      onClick={() => onSelect(entry)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {playedShows.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Top shows · everyone</h3>
              <ul className="title-list">
                {playedShows.map((show) => {
                  const group = findShow(groups, show.show);
                  const cover = group ? coverStillForShow(group) : undefined;
                  return (
                  <li key={show.show}>
                    <TitleCard
                      name={show.show}
                      meta={`${show.playCount} play${show.playCount === 1 ? "" : "s"}`}
                      stillTitleId={cover?.titleId}
                      stillTitle={show.show}
                      onClick={() => setView({ level: "show", show: show.show, from: "home" })}
                    />
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {railsReady && !hasPersonalRails && !hasCrowdRails && (
            <p className="muted home-empty-rails">
              Browse the library to start. Everyone&apos;s most-played titles show up here when
              play counts load.
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
