import { useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { countPlayableQuestions } from "../lib/content/playable";
import { getStarsForTitle } from "../lib/stars/store";
import { buildMiniGameQueue } from "../lib/game/miniGame";
import { GAME_LENGTHS, GAME_MODES, MINI_GAME_SIZE, type GameLength, type GameMode } from "../types/game";

export type GameSetup = {
  mode: GameMode;
  length: GameLength;
};

type Props = {
  entry: CatalogEntry;
  onStart: (setup: GameSetup) => void;
  onBack: () => void;
};

export function SetupScreen({ entry, onStart, onBack }: Props) {
  const [mode, setMode] = useState<GameMode>("fun");
  const [length, setLength] = useState<GameLength>("full");
  const title = getTitle(entry.id);
  const questionCount = title ? countPlayableQuestions(title) : 0;
  const starredCount = getStarsForTitle(entry.id).length;
  const miniCount = title
    ? Math.min(MINI_GAME_SIZE, buildMiniGameQueue(title, getStarsForTitle(entry.id).map((s) => s.lineIndex)).length)
    : 0;

  return (
    <section className="panel setup-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Library
      </button>

      <h2>{entry.title}</h2>
      <p className="muted setup-meta">
        {questionCount} dialogue questions · {starredCount} starred
      </p>

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
                      ? `${miniCount} questions — starred lines first`
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

      <button type="button" className="button primary" onClick={() => onStart({ mode, length })}>
        Start game
      </button>
    </section>
  );
}
