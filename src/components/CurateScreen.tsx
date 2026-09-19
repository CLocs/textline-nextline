import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { leadInForPrompt } from "../lib/game/promptContext";
import { getValidPromptIndices } from "../lib/game/miniGame";
import {
  getStarsForTitle,
  hydrateStarsForTitle,
  isLoved,
  isStarred,
  toggleLove,
  toggleStar,
} from "../lib/stars/sync";
import { MAX_LOVED_PER_TITLE } from "../lib/stars/store";
import { isLoggedIn } from "../lib/auth/session";
import { createParallelPack } from "../lib/parallels/api";
import { LineSendControl } from "./LineSendControl";

const PACK_MIN = 3;
const PACK_MAX = 8;

type Props = {
  entry: CatalogEntry;
  onBack: () => void;
  onOpenParallel: (packId: string) => void;
};

export function CurateScreen({ entry, onBack, onOpenParallel }: Props) {
  const title = getTitle(entry.id);
  const [starredCount, setStarredCount] = useState(() => getStarsForTitle(entry.id).length);
  const [starredOnly, setStarredOnly] = useState(false);
  const [showPreviousLines, setShowPreviousLines] = useState(true);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [packName, setPackName] = useState("");
  const [packBusy, setPackBusy] = useState(false);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  /** Anchor for Shift+click range select (line index). */
  const packSelectAnchorRef = useRef<number | null>(null);

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

  useEffect(() => {
    setSelected([]);
    setPackName("");
    setPackMsg(null);
    packSelectAnchorRef.current = null;
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
      if (line?.text.toLowerCase().includes(normalizedQuery)) return true;
      return leadInForPrompt(title, lineIndex).some((lead) =>
        lead.text.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [title, entry.id, promptIndices, starredOnly, query, revision]);

  async function handleToggle(lineIndex: number, text: string) {
    await toggleStar(entry.id, lineIndex, text);
    setStarredCount(getStarsForTitle(entry.id).length);
    setRevision((value) => value + 1);
  }

  async function handleLove(lineIndex: number) {
    const result = await toggleLove(entry.id, lineIndex);
    if (result === null) {
      setPackMsg("Star a line before loving it.");
      return;
    }
    const lovedCount = getStarsForTitle(entry.id).filter((s) => s.loved).length;
    if (!result && lovedCount >= MAX_LOVED_PER_TITLE) {
      setPackMsg(`Love at most ${MAX_LOVED_PER_TITLE} lines per title.`);
    }
    setRevision((value) => value + 1);
  }

  function handlePackSelect(lineIndex: number, shiftKey: boolean) {
    setPackMsg(null);

    if (shiftKey && packSelectAnchorRef.current != null) {
      const from = filteredIndices.indexOf(packSelectAnchorRef.current);
      const to = filteredIndices.indexOf(lineIndex);
      if (from !== -1 && to !== -1) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const range = filteredIndices.slice(lo, hi + 1);
        setSelected((prev) => {
          const merged = new Set(prev);
          let truncated = false;
          for (const index of range) {
            if (merged.has(index)) continue;
            if (merged.size >= PACK_MAX) {
              truncated = true;
              break;
            }
            merged.add(index);
          }
          if (truncated) {
            setPackMsg(`Pick at most ${PACK_MAX} lines for a pack.`);
          }
          return [...merged].sort((a, b) => a - b);
        });
        return;
      }
    }

    packSelectAnchorRef.current = lineIndex;
    setSelected((prev) => {
      if (prev.includes(lineIndex)) return prev.filter((i) => i !== lineIndex);
      if (prev.length >= PACK_MAX) {
        setPackMsg(`Pick at most ${PACK_MAX} lines for a pack.`);
        return prev;
      }
      return [...prev, lineIndex].sort((a, b) => a - b);
    });
  }

  async function handleSavePack() {
    if (!isLoggedIn()) {
      setPackMsg("Sign in to save a parallel pack.");
      return;
    }
    if (selected.length < PACK_MIN || selected.length > PACK_MAX) {
      setPackMsg(`Select ${PACK_MIN}–${PACK_MAX} lines.`);
      return;
    }
    const name = packName.trim() || `${entry.title} beat`;
    setPackBusy(true);
    setPackMsg(null);
    const result = await createParallelPack({
      titleId: entry.id,
      lineIndices: selected,
      name,
    });
    setPackBusy(false);
    if ("error" in result) {
      setPackMsg(result.error);
      return;
    }
    setSelected([]);
    setPackName("");
    packSelectAnchorRef.current = null;
    setPackMsg(`Saved “${result.pack.name}”. Opening pack…`);
    onOpenParallel(result.pack.id);
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

  const canSavePack = selected.length >= PACK_MIN && selected.length <= PACK_MAX;

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
          enabled. ♥ Love up to {MAX_LOVED_PER_TITLE} golden lines so they usually land in mini-games.
          Check 3–8 lines to save a quote-parallel pack (Shift+click to select a range).
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
        <label className="curate-filter">
          <input
            type="checkbox"
            checked={showPreviousLines}
            onChange={(event) => setShowPreviousLines(event.target.checked)}
          />
          Previous lines
        </label>
      </div>

      {selected.length > 0 && (
        <div className="curate-pack-bar">
          <span className="muted">
            {selected.length}/{PACK_MAX} selected
            {selected.length < PACK_MIN ? ` (need ${PACK_MIN})` : ""}
          </span>
          <label className="curate-pack-name">
            <span className="sr-only">Pack name</span>
            <input
              type="text"
              maxLength={80}
              value={packName}
              onChange={(event) => setPackName(event.target.value)}
              placeholder="Pack name (e.g. Not fucking real)"
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={!canSavePack || packBusy}
            onClick={() => void handleSavePack()}
          >
            {packBusy ? "Saving…" : "Save as parallel pack"}
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={packBusy}
            onClick={() => {
              setSelected([]);
              setPackMsg(null);
              packSelectAnchorRef.current = null;
            }}
          >
            Clear
          </button>
        </div>
      )}

      {packMsg && (
        <p className="share-message" role="status">
          {packMsg}
        </p>
      )}

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
            const loved = isLoved(entry.id, lineIndex);
            const isSelected = selected.includes(lineIndex);

            return (
              <li
                key={lineIndex}
                className={`curate-item${starred ? " starred" : ""}${loved ? " loved" : ""}${isSelected ? " selected" : ""}`}
              >
                <div className="curate-controls">
                  <label className="curate-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(event) => {
                        event.preventDefault();
                        handlePackSelect(lineIndex, event.shiftKey);
                      }}
                      onChange={() => {
                        /* controlled via onClick so Shift+click can range-select */
                      }}
                      aria-label={`Select line ${lineIndex + 1} for parallel pack`}
                    />
                  </label>
                  <button
                    type="button"
                    className={`curate-star${starred ? " starred" : ""}`}
                    aria-pressed={starred}
                    aria-label={starred ? "Unstar line" : "Star line"}
                    onClick={() => void handleToggle(lineIndex, line.text)}
                  >
                    {starred ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    className={`curate-love${loved ? " loved" : ""}${starred ? "" : " is-placeholder"}`}
                    aria-pressed={loved}
                    aria-label={
                      starred
                        ? loved
                          ? "Unlove line"
                          : "Love line for mini-games"
                        : "Star a line before loving it"
                    }
                    disabled={!starred}
                    onClick={() => void handleLove(lineIndex)}
                  >
                    {loved ? "♥" : "♡"}
                  </button>
                </div>
                <div className="curate-copy">
                  <span className="curate-line-index">Line {lineIndex + 1}</span>
                  {showPreviousLines &&
                    leadInForPrompt(title, lineIndex).map((lead) => (
                      <p key={lead.lineIndex} className="curate-lead-in">
                        {lead.text}
                      </p>
                    ))}
                  <p className="curate-text">{line.text}</p>
                </div>
                <LineSendControl titleId={entry.id} lineIndex={lineIndex} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
