import { useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { countPlayableQuestions } from "../lib/content/playable";
import { GAME_MODES, type GameMode } from "../types/game";

type Props = {
  entry: CatalogEntry;
  onStart: (mode: GameMode) => void;
  onBack: () => void;
};

export function SetupScreen({ entry, onStart, onBack }: Props) {
  const [mode, setMode] = useState<GameMode>("fun");
  const title = getTitle(entry.id);
  const questionCount = title ? countPlayableQuestions(title) : 0;

  return (
    <section className="panel setup-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Library
      </button>

      <h2>{entry.title}</h2>
      <p className="muted setup-meta">
        {questionCount} dialogue questions · sound effects and stage directions are skipped
      </p>

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

      <button type="button" className="button primary" onClick={() => onStart(mode)}>
        Start game
      </button>
    </section>
  );
}
