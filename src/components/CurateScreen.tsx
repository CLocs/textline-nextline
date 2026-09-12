import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { getValidPromptIndices } from "../lib/game/miniGame";
import {
  getStarsForTitle,
  hydrateStarsForTitle,
  isStarred,
  toggleStar,
} from "../lib/stars/sync";

type Props = {
  entry: CatalogEntry;
  onBack: () => void;
};

export function CurateScreen({ entry, onBack }: Props) {
  const title = getTitle(entry.id);
  const [starredCount, setStarredCount] = useState(() => getStarsForTitle(entry.id).length);
  const [starredOnly, setStarredOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      await hydrateStarsForTitle(entry.id);
      if (!cancelled) setStarredCount(getStarsForTitle(entry.id).length);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const promptIndices = useMemo(
    () => (title ? getValidPromptIndices(title) : []),
    [title],
  );

  const filteredIndices = useMemo(() => {
    if (!title) return [];
    const normalizedQuery = query.trim().toLowerCase();

    return promptIndices.filter((lineIndex) => {
      if (starredOnly && !isStarred(entry.id, lineIndex)) return false;
      if (!normalizedQuery) return true;
      const line = getLine(title, lineIndex);
      return line?.text.toLowerCase().includes(normalizedQuery) ?? false;
    });
  }, [title, entry.id, promptIndices, starredOnly, query, revision]);

  async function handleToggle(lineIndex: number, text: string) {
    await toggleStar(entry.id, lineIndex, text);
    setStarredCount(getStarsForTitle(entry.id).length);
    setRevision((value) => value + 1);
  }

  if (!title) {
    return (
      <section className="panel curate-panel">
        <p className="empty">Episode not found.</p>
        <button type="button" className="button ghost" onClick={onBack}>
          ← Back
        </button>
      </section>
    );
  }

  return (
    <section className="panel curate-panel">
      <button type="button" className="button ghost back-link" onClick={onBack}>
        ← Setup
      </button>

      <div className="curate-header">
        <h2>Curate stars</h2>
        <p className="muted curate-meta">
          {entry.title} · {starredCount} starred · {promptIndices.length} quiz lines
        </p>
        <p className="curate-hint">
          Star lines for mini-games without playing through. Syncs to the cloud when the API is
          enabled.
        </p>
      </div>

      <div className="curate-toolbar">
        <label className="curate-search">
          <span className="sr-only">Filter lines</span>
          <input
            type="search"
            placeholder="Filter transcript…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="curate-filter">
          <input
            type="checkbox"
            checked={starredOnly}
            onChange={(event) => setStarredOnly(event.target.checked)}
          />
          Starred only
        </label>
      </div>

      {filteredIndices.length === 0 ? (
        <p className="muted curate-empty">
          {starredOnly || query ? "No lines match your filters." : "No quiz lines in this episode."}
        </p>
      ) : (
        <ol className="curate-list">
          {filteredIndices.map((lineIndex) => {
            const line = getLine(title, lineIndex);
            if (!line) return null;

            const starred = isStarred(entry.id, lineIndex);

            return (
              <li key={lineIndex} className={`curate-item${starred ? " starred" : ""}`}>
                <button
                  type="button"
                  className={`curate-star${starred ? " starred" : ""}`}
                  aria-pressed={starred}
                  aria-label={starred ? "Unstar line" : "Star line"}
                  onClick={() => void handleToggle(lineIndex, line.text)}
                >
                  {starred ? "★" : "☆"}
                </button>
                <div className="curate-copy">
                  <span className="curate-line-index">Line {lineIndex + 1}</span>
                  <p className="curate-text">{line.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
