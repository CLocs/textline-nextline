import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { countPlayableQuestions } from "../lib/content/playable";
import { buildMiniGameQueue } from "../lib/game/miniGame";
import {
  getStarsForTitle,
  hydrateStarsForTitle,
  loadPopularStars,
} from "../lib/stars/sync";
import { fetchTitleStats, type TitleStats } from "../lib/runs/api";
import { coverStillLineIndex } from "../lib/content/stillsCover";
import { GAME_LENGTHS, GAME_MODES, MINI_GAME_SIZE, type GameLength, type GameMode } from "../types/game";
import { PosterArt } from "./PosterArt";

export type GameSetup = {
  mode: GameMode;
  length: GameLength;
  crowdPopular?: number[];
};

type Props = {
  entry: CatalogEntry;
  onStart: (setup: GameSetup) => void;
  onCurate: () => void;
  onShareMiniGame: () => void;
  shareBusy?: boolean;
  shareMessage?: string | null;
  onBack: () => void;
};

export function SetupScreen({
  entry,
  onStart,
  onCurate,
  onShareMiniGame,
  shareBusy,
  shareMessage,
  onBack,
}: Props) {
  const [mode, setMode] = useState<GameMode>("fun");
  const [length, setLength] = useState<GameLength>("mini");
  const [starredCount, setStarredCount] = useState(() => getStarsForTitle(entry.id).length);
  const [crowdPopular, setCrowdPopular] = useState<number[]>([]);
  const [titleStats, setTitleStats] = useState<TitleStats | null>(null);

  const title = getTitle(entry.id);
  const questionCount = title ? countPlayableQuestions(title) : 0;
  const personalStarred = getStarsForTitle(entry.id).map((star) => star.lineIndex);
  const miniCount = title
    ? Math.min(
        MINI_GAME_SIZE,
        buildMiniGameQueue(title, { personalStarred, crowdPopular }).length,
      )
    : 0;

  const highGames = useMemo(() => {
    if (!titleStats) return [];
    return [...titleStats.players].sort(
      (a, b) => b.bestCorrect - a.bestCorrect || b.gamesPlayed - a.gamesPlayed,
    );
  }, [titleStats]);

  useEffect(() => {
    let cancelled = false;

    async function loadStars() {
      await hydrateStarsForTitle(entry.id);
      if (cancelled) return;
      setStarredCount(getStarsForTitle(entry.id).length);

      const popular = await loadPopularStars(entry.id);
      if (!cancelled) setCrowdPopular(popular);
    }

    async function loadStats() {
      setTitleStats(null);
      const stats = await fetchTitleStats(entry.id);
      if (!cancelled) setTitleStats(stats);
    }

    void loadStars();
    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  return (
    <section className="panel setup-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Home
      </button>

      <div className="setup-heading">
        <PosterArt
          titleId={entry.id}
          title={entry.title}
          lineIndex={coverStillLineIndex(entry.id)}
          fallback="poster"
          className="setup-poster"
        />
        <div>
          <h2>{entry.title}</h2>
          <p className="muted setup-meta">
            {questionCount} dialogue questions · {starredCount} starred
            {titleStats && titleStats.playCount > 0
              ? ` · ${titleStats.playCount} play${titleStats.playCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      </div>

      {titleStats && titleStats.players.length > 0 && (
        <div className="title-leaders">
          <div className="title-leaders-col">
            <h3 className="library-group-heading">Most played</h3>
            <ol className="title-leaders-list">
              {titleStats.players.slice(0, 5).map((player) => (
                <li key={`played-${player.displayName}`}>
                  <span>{player.displayName}</span>
                  <span className="muted">
                    {player.gamesPlayed} game{player.gamesPlayed === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="title-leaders-col">
            <h3 className="library-group-heading">High game</h3>
            <ol className="title-leaders-list">
              {highGames.slice(0, 5).map((player) => (
                <li key={`high-${player.displayName}`}>
                  <span>{player.displayName}</span>
                  <span className="muted">
                    {player.bestCorrect} correct
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <fieldset className="mode-picker">
        <legend>Session length</legend>
        <ul className="mode-list">
          {GAME_LENGTHS.map((option) => (
            <li key={option.id}>
              <label className="mode-option">
                <input
                  type="radio"
                  name="length"
                  value={option.id}
                  checked={length === option.id}
                  onChange={() => setLength(option.id)}
                />
                <span className="mode-copy">
                  <span className="mode-label">{option.label}</span>
                  <span className="mode-description">
                    {option.id === "mini"
                      ? `${miniCount} questions — your stars, then crowd favorites`
                      : option.description}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="mode-picker">
        <legend>Pick a mode</legend>
        <ul className="mode-list">
          {GAME_MODES.map((option) => (
            <li key={option.id}>
              <label className={`mode-option ${option.available ? "" : "disabled"}`}>
                <input
                  type="radio"
                  name="mode"
                  value={option.id}
                  checked={mode === option.id}
                  disabled={!option.available}
                  onChange={() => setMode(option.id)}
                />
                <span className="mode-copy">
                  <span className="mode-label">{option.label}</span>
                  <span className="mode-description">{option.description}</span>
                  {!option.available && <span className="mode-soon">Coming soon</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <button
        type="button"
        className="button primary"
        onClick={() => onStart({ mode, length, crowdPopular })}
      >
        Start game
      </button>

      <button type="button" className="button ghost curate-link" onClick={onCurate}>
        Curate stars →
      </button>

      <button
        type="button"
        className="button ghost curate-link"
        onClick={onShareMiniGame}
        disabled={shareBusy || starredCount === 0}
      >
        {shareBusy ? "Creating link…" : "Share mini-game link"}
      </button>
      {starredCount === 0 && (
        <p className="muted share-hint">Star some lines first (or Curate) to share a mini-game.</p>
      )}
      {shareMessage && (
        <p className="share-message" role="status">
          {shareMessage}
        </p>
      )}
    </section>
  );
}
