import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { leadInForPrompt } from "../lib/game/promptContext";
import { getValidPromptIndices } from "../lib/game/miniGame";
import {
  getStarsForTitle,
  hydrateStarsForTitle,
  toggleLove,
  toggleStar,
} from "../lib/stars/sync";
import { MAX_LOVED_PER_TITLE } from "../lib/stars/store";
import { isLoggedIn } from "../lib/auth/session";
import { createParallelPack } from "../lib/parallels/api";
import { offsetsForSizes, VIRTUAL_LIST_GAP, visibleWindow } from "../lib/ui/virtualWindow";
import { LineSendControl } from "./LineSendControl";

const PACK_MIN = 3;
/** Room for a full scene (e.g. Wolf lunch), not just a short beat. */
const PACK_MAX = 500;
const ROW_ESTIMATE = 92;
const ROW_ESTIMATE_WITH_PREV = 148;
const ROW_OVERSCAN = 10;

type Props = {
  entry: CatalogEntry;
  onBack: () => void;
  onOpenParallel: (packId: string) => void;
  /** Scroll / highlight this line when opening from global search. */
  focusLineIndex?: number | null;
};

export function CurateScreen({ entry, onBack, onOpenParallel, focusLineIndex }: Props) {
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
  const [highlightLine, setHighlightLine] = useState<number | null>(
    typeof focusLineIndex === "number" ? focusLineIndex : null,
  );
  /** Anchor for Shift+click range select (line index). */
  const packSelectAnchorRef = useRef<number | null>(null);
  /** Skip the change event that can follow a Shift+click we already handled. */
  const skipPackChangeRef = useRef(false);
  const didFocusRef = useRef(false);

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

  // One localStorage read per revision — not per row (thousands of quiz lines).
  const starSets = useMemo(() => {
    const stars = getStarsForTitle(entry.id);
    const starred = new Set<number>();
    const loved = new Set<number>();
    for (const star of stars) {
      starred.add(star.lineIndex);
      if (star.loved) loved.add(star.lineIndex);
    }
    return { starred, loved };
  }, [entry.id, revision]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const listRef = useRef<HTMLDivElement>(null);
  const sizeMapRef = useRef(new Map<number, number>());
  const sizeFlushRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [sizeRev, setSizeRev] = useState(0);

  const filteredIndices = useMemo(() => {
    if (!title) return [];
    const normalizedQuery = query.trim().toLowerCase();

    return promptIndices.filter((lineIndex) => {
      if (starredOnly && !starSets.starred.has(lineIndex)) return false;
      if (!normalizedQuery) return true;
      const line = getLine(title, lineIndex);
      if (line?.text.toLowerCase().includes(normalizedQuery)) return true;
      return leadInForPrompt(title, lineIndex).some((lead) =>
        lead.text.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [title, promptIndices, starredOnly, query, starSets]);

  const estimateSize = showPreviousLines ? ROW_ESTIMATE_WITH_PREV : ROW_ESTIMATE;

  const scheduleSizeFlush = useCallback(() => {
    if (sizeFlushRef.current != null) return;
    sizeFlushRef.current = requestAnimationFrame(() => {
      sizeFlushRef.current = null;
      setSizeRev((value) => value + 1);
    });
  }, []);

  const handleRowHeight = useCallback(
    (lineIndex: number, height: number) => {
      if (sizeMapRef.current.get(lineIndex) === height) return;
      sizeMapRef.current.set(lineIndex, height);
      scheduleSizeFlush();
    },
    [scheduleSizeFlush],
  );

  useEffect(() => {
    sizeMapRef.current.clear();
    setSizeRev((value) => value + 1);
  }, [showPreviousLines, entry.id]);

  useEffect(() => {
    // Keep scroll position free for focusLineIndex jump from global search.
    if (typeof focusLineIndex === "number" && !didFocusRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [query, starredOnly, entry.id, focusLineIndex]);

  useEffect(() => {
    return () => {
      if (sizeFlushRef.current != null) cancelAnimationFrame(sizeFlushRef.current);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredIndices.length]);

  const offsets = useMemo(() => {
    const sizes = filteredIndices.map(
      (lineIndex) => sizeMapRef.current.get(lineIndex) ?? estimateSize,
    );
    return offsetsForSizes(sizes, VIRTUAL_LIST_GAP);
  }, [filteredIndices, estimateSize, sizeRev]);

  const totalSize = offsets[filteredIndices.length] ?? 0;
  const windowRange = visibleWindow(offsets, scrollTop, viewportHeight, ROW_OVERSCAN);
  const visibleIndices = filteredIndices.slice(windowRange.start, windowRange.end);

  useEffect(() => {
    didFocusRef.current = false;
    setHighlightLine(typeof focusLineIndex === "number" ? focusLineIndex : null);
  }, [entry.id, focusLineIndex]);

  useLayoutEffect(() => {
    if (didFocusRef.current) return;
    if (typeof focusLineIndex !== "number") return;
    const pos = filteredIndices.indexOf(focusLineIndex);
    if (pos < 0) return;
    const top = offsets[pos] ?? 0;
    const el = listRef.current;
    if (el) el.scrollTop = top;
    setScrollTop(top);
    didFocusRef.current = true;
  }, [focusLineIndex, filteredIndices, offsets]);

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
        if (range.length > PACK_MAX) {
          setPackMsg(`Pick at most ${PACK_MAX} lines for a pack.`);
        }
        // Anchor → click selects the contiguous range (capped), like a file list.
        setSelected(range.slice(0, PACK_MAX));
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
          Check {PACK_MIN}–{PACK_MAX} lines to save a quote-parallel pack (Shift+click to select a
          range).
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
        <div
          className="curate-list"
          role="list"
          ref={listRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div className="curate-list-canvas" style={{ height: totalSize }}>
            {visibleIndices.map((lineIndex, visibleOffset) => {
              const line = getLine(title, lineIndex);
              if (!line) return null;

              const starred = starSets.starred.has(lineIndex);
              const loved = starSets.loved.has(lineIndex);
              const isSelected = selectedSet.has(lineIndex);
              const isFocused = highlightLine === lineIndex;
              const rowIndex = windowRange.start + visibleOffset;

              return (
                <CurateLineItem
                  key={lineIndex}
                  lineIndex={lineIndex}
                  rowIndex={rowIndex}
                  setSize={filteredIndices.length}
                  offset={offsets[rowIndex] ?? 0}
                  className={`curate-item${starred ? " starred" : ""}${loved ? " loved" : ""}${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}`}
                  onHeight={handleRowHeight}
                >
                  <div className="curate-controls">
                    <label className="curate-select">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(event) => {
                          if (!event.shiftKey) return;
                          // Shift+click: take over so the browser doesn't only toggle this box.
                          event.preventDefault();
                          skipPackChangeRef.current = true;
                          handlePackSelect(lineIndex, true);
                        }}
                        onChange={() => {
                          if (skipPackChangeRef.current) {
                            skipPackChangeRef.current = false;
                            return;
                          }
                          handlePackSelect(lineIndex, false);
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
                  <LazyLineSendControl titleId={entry.id} lineIndex={lineIndex} />
                </CurateLineItem>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

type CurateLineItemProps = {
  lineIndex: number;
  rowIndex: number;
  setSize: number;
  offset: number;
  className: string;
  onHeight: (lineIndex: number, height: number) => void;
  children: ReactNode;
};

function CurateLineItem({
  lineIndex,
  rowIndex,
  setSize,
  offset,
  className,
  onHeight,
  children,
}: CurateLineItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const report = () => onHeight(lineIndex, node.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [lineIndex, onHeight]);

  return (
    <div
      ref={ref}
      role="listitem"
      className={className}
      style={{ top: offset }}
      aria-setsize={setSize}
      aria-posinset={rowIndex + 1}
    >
      {children}
    </div>
  );
}

/** Avoid mounting ~3k send menus; hydrate on hover/focus/click. */
function LazyLineSendControl({ titleId, lineIndex }: { titleId: string; lineIndex: number }) {
  const [active, setActive] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  if (active) {
    return <LineSendControl titleId={titleId} lineIndex={lineIndex} autoOpen={openOnMount} />;
  }

  return (
    <button
      type="button"
      className="curate-send"
      aria-label="Send this line"
      title="Send or copy this line"
      onMouseEnter={() => setActive(true)}
      onFocus={() => setActive(true)}
      onClick={() => {
        setOpenOnMount(true);
        setActive(true);
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M2.4 7.6 13 2.5c.6-.3 1.2.3.9.9L8.8 13.8c-.3.6-1.2.5-1.4-.2L6.2 9.4 2.2 8.2c-.7-.2-.6-1.1.2-1.4Z"
        />
      </svg>
    </button>
  );
}
