import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { lineKey, todayIso, type DailyLine } from "../lib/game/dailyPick";
import { loadTodaysCards } from "../lib/game/dailyLoad";
import { loadStreak, readLocalStreak } from "../lib/game/dailyClient";
import { framedMovies, framedTitleIds, sampleFramedMovies } from "../lib/game/playNow";
import { coverStillLineIndex } from "../lib/content/stillsCover";
import { fetchFriends, type FriendListItem } from "../lib/friends/api";
import { bestFriends } from "../lib/friends/faces";
import { FriendFaces } from "./FriendFaces";
import { PosterArt } from "./PosterArt";
import { VisitQuote } from "./VisitQuote";

type Props = {
  entries: CatalogEntry[];
  onPlay: (startIndex: number) => void;
  onPlayInstant: () => void;
  onPlayMovie: (entry: CatalogEntry) => void;
};

let shownMovies: CatalogEntry[] | null = null;

function moviesForVisit(movies: CatalogEntry[]): CatalogEntry[] {
  if (
    shownMovies &&
    shownMovies.length > 0 &&
    shownMovies.every((shown) => movies.some((movie) => movie.id === shown.id))
  ) {
    return shownMovies;
  }
  shownMovies = sampleFramedMovies(movies, [], 2);
  return shownMovies;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M20 12a8 8 0 1 1-2.3-5.7"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 4v5h-5"
      />
    </svg>
  );
}

function snippet(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
}

export function DailyHome({ entries, onPlay, onPlayInstant, onPlayMovie }: Props) {
  const [streak, setStreak] = useState(readLocalStreak);
  const [cards, setCards] = useState<DailyLine[] | null>(null);
  const [faces, setFaces] = useState<FriendListItem[]>([]);
  const [quotesOpen, setQuotesOpen] = useState(
    () => readLocalStreak().lastCompletedOn !== todayIso(),
  );
  const movies = useMemo(() => framedMovies(entries, framedTitleIds()), [entries]);
  const [pair, setPair] = useState<CatalogEntry[]>(() => moviesForVisit(movies));
  const doneToday = streak.lastCompletedOn === todayIso();
  const showQuotes = !doneToday || quotesOpen;
  const badge =
    streak.streak > 0
      ? `${streak.streak}-day streak${doneToday ? " · done today" : ""}`
      : "Start a streak";

  useEffect(() => {
    let cancelled = false;
    void loadStreak().then((next) => {
      if (!cancelled) setStreak(next);
    });
    void loadTodaysCards().then((next) => {
      if (!cancelled) setCards(next);
    });
    void fetchFriends().then((list) => {
      if (cancelled || "error" in list) return;
      setFaces(bestFriends(list));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="home-top">
        <div className="section-header">
          <h2>Home</h2>
          <p className="muted">Your games, then what everyone else is playing.</p>
        </div>
        <p className="streak-badge" aria-label={badge}>
          {badge}
        </p>
      </div>

      <section className="panel home-section">
        <FriendFaces friends={faces} label="Friends" className="home-friend-faces" />
        <VisitQuote />
        <div className="play-now">
          <h3 className="library-group-heading">Play now</h3>
          <div className="play-now-actions">
            <button type="button" className="button primary play-now-play" onClick={onPlayInstant}>
              Play 3
            </button>
            <p className="muted">Three quotes, right now. Not today’s daily.</p>
          </div>
          {pair.length > 0 ? (
            <>
              <div className="daily-fold-header play-now-movies-header">
                <h3 className="library-group-heading">Two movies</h3>
                <button
                  type="button"
                  className="button ghost play-now-refresh"
                  aria-label="Other movies"
                  title="Other movies"
                  disabled={movies.length <= 2}
                  onClick={() => {
                    shownMovies = sampleFramedMovies(movies, pair.map((entry) => entry.id), 2);
                    setPair(shownMovies);
                  }}
                >
                  <RefreshIcon />
                </button>
              </div>
              <ul className="play-now-movies">
                {pair.map((entry) => {
                  const lineIndex = coverStillLineIndex(entry.id);
                  return (
                    <li key={entry.id}>
                      <button type="button" className="title-card" onClick={() => onPlayMovie(entry)}>
                        {lineIndex != null ? (
                          <PosterArt
                            titleId={entry.id}
                            title={entry.title}
                            lineIndex={lineIndex}
                            fallback="hide"
                            className="title-card-still"
                          />
                        ) : null}
                        <span className="title-card-copy">
                          <span className="title-card-name">{entry.title}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
        <div className="daily-fold-header">
          <h3 className="library-group-heading">Today&apos;s Daily Quotes</h3>
          {doneToday ? (
            <button
              type="button"
              className="button ghost"
              aria-expanded={quotesOpen}
              onClick={() => setQuotesOpen((open) => !open)}
            >
              {quotesOpen ? "Hide" : "Show"}
            </button>
          ) : null}
        </div>
        {!showQuotes ? (
          <p className="muted daily-folded-note">Finished for today. Show the quotes to play one again.</p>
        ) : cards === null ? (
          <p className="muted">Loading today’s three…</p>
        ) : cards.length === 0 ? (
          <p className="muted">No framed quotes lined up for today.</p>
        ) : (
          <ul className="title-list">
            {cards.map((card, index) => {
              const title = getTitle(card.titleId);
              const prompt = title ? getLine(title, card.lineIndex) : undefined;
              const isLineOfDay = card.slot === "global";
              return (
                <li key={lineKey(card)} className="daily-quote-row">
                  <button
                    type="button"
                    className={`title-card daily-card${isLineOfDay ? " is-today" : ""}`}
                    onClick={() => onPlay(index)}
                  >
                    <PosterArt
                      titleId={card.titleId}
                      title={title?.title ?? "Today"}
                      lineIndex={card.lineIndex}
                      fallback="hide"
                      className="title-card-still"
                    />
                    <span className="title-card-copy">
                      {isLineOfDay ? <span className="daily-today-label">Line of the day</span> : null}
                      <span className="title-card-name">
                        {prompt ? snippet(prompt.text) : `Question ${index + 1}`}
                      </span>
                      <span className="muted">{title?.title ?? `Question ${index + 1}`}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
