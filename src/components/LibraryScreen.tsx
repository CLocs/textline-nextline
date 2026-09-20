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
import { fetchInbox, type ParallelInboxItem } from "../lib/inbox/api";
import { isAuthApiEnabled } from "../lib/auth/api";
import { isLocalDevSession } from "../lib/auth/session";
import {
  playCountMap,
  recentFromRuns,
  topPlayedMovies,
  topPlayedShows,
  yourTopPlayed,
} from "../lib/content/playedRails";
import { coverStillForShow, coverStillLineIndex } from "../lib/content/stillsCover";
import { PosterArt } from "./PosterArt";
import { ParallelInboxCard } from "./ParallelInboxCard";
import { ChatsList } from "./ChatsList";
import { useChatsUnreadBreakdown } from "../lib/chats/useChatsUnreadCount";

type Props = {
  entries: CatalogEntry[];
  onSelect: (entry: CatalogEntry) => void;
  onOpenDm: (peerUserId: string, displayName: string) => void;
  onOpenGroup: (groupId: string, name: string) => void;
  onOpenChats: () => void;
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
  stillLineIndex,
  onClick,
}: {
  name: string;
  meta: string;
  stillTitleId?: string;
  stillTitle?: string;
  stillLineIndex?: number;
  onClick: () => void;
}) {
  const lineIndex =
    stillLineIndex ?? (stillTitleId ? coverStillLineIndex(stillTitleId) : undefined);
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

export function LibraryScreen({
  entries,
  onSelect,
  onOpenDm,
  onOpenGroup,
  onOpenChats,
}: Props) {
  const [view, setView] = useState<View>({ level: "home" });
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<CatalogEntry[]>([]);
  const [yours, setYours] = useState<ReturnType<typeof yourTopPlayed>>([]);
  const [parallelInbox, setParallelInbox] = useState<ParallelInboxItem[]>([]);
  const [railsReady, setRailsReady] = useState(false);
  const chatsUnread = useChatsUnreadBreakdown();
  const chatsApiReady = isAuthApiEnabled() && !isLocalDevSession();
  const groups = groupCatalogEntries(entries);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchPlayedStats(),
      fetchMyRuns(),
      isAuthApiEnabled() && !isLocalDevSession()
        ? fetchInbox()
        : Promise.resolve({ items: [], parallels: [] as ParallelInboxItem[] }),
    ]).then(([titles, runs, inboxResult]) => {
      if (cancelled) return;
      setCounts(playCountMap(titles));
      setRecent(recentFromRuns(runs, entries));
      setYours(yourTopPlayed(runs, entries));
      if (inboxResult && !("error" in inboxResult)) {
        setParallelInbox(inboxResult.parallels);
      } else {
        setParallelInbox([]);
      }
      setRailsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const playedMovies = useMemo(() => topPlayedMovies(entries, counts), [entries, counts]);
  const playedShows = useMemo(() => topPlayedShows(entries, counts), [entries, counts]);
  const hasPersonalRails = recent.length > 0 || yours.length > 0 || parallelInbox.length > 0;
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
          <div className="library-group">
            <div className="section-header chats-home-header">
              <div className="chats-home-title">
                <h3 className="library-group-heading">Chats</h3>
                {chatsApiReady ? (
                  <p className="chats-home-unread muted">
                    {chatsUnread.quote > 0 || chatsUnread.text > 0 ? (
                      <span className="chats-dual-unread chats-home-dual">
                        {chatsUnread.quote > 0 ? (
                          <span
                            className="chats-unread-chip"
                            title={`${chatsUnread.quote} unread quotes`}
                          >
                            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                              <path
                                fill="currentColor"
                                d="M3.5 3.5h3.2v4.2c0 2.1-1.1 3.4-3.2 3.9V9.8c.9-.3 1.4-.9 1.4-2H3.5V3.5zm6 0h3.2v4.2c0 2.1-1.1 3.4-3.2 3.9V9.8c.9-.3 1.4-.9 1.4-2H9.5V3.5z"
                              />
                            </svg>
                            {chatsUnread.quote}
                            <span className="sr-only"> unread quotes</span>
                          </span>
                        ) : null}
                        {chatsUnread.text > 0 ? (
                          <span
                            className="chats-unread-chip is-text"
                            title={`${chatsUnread.text} unread messages`}
                          >
                            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                              <path
                                fill="currentColor"
                                d="M1.5 3.2h13v9.6h-13V3.2zm1.2 1.3 5.3 3.6 5.3-3.6v-.1H2.7zm0 1.5v5.5h10.6V6l-5.3 3.5L2.7 6z"
                              />
                            </svg>
                            {chatsUnread.text}
                            <span className="sr-only"> unread messages</span>
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "0 unread. You're up to date."
                    )}
                  </p>
                ) : null}
              </div>
              <button type="button" className="button ghost" onClick={onOpenChats}>
                See all
              </button>
            </div>
            <ChatsList compact onOpenDm={onOpenDm} onOpenGroup={onOpenGroup} />
          </div>

          {parallelInbox.length > 0 && (
            <div className="library-group">
              <h3 className="library-group-heading">Parallel rewrites</h3>
              <ul className="inbox-line-list">
                {parallelInbox
                  .slice()
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 8)
                  .map((item) => (
                    <li key={`p-${item.id}`}>
                      <ParallelInboxCard item={item} />
                    </li>
                  ))}
              </ul>
            </div>
          )}

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
