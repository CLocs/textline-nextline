import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogEntry } from "../types/content";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { leadInForPrompt } from "../lib/game/promptContext";
import { getValidPromptIndices, streakForSend } from "../lib/game/miniGame";
import { getQuotesForTitle, hydrateQuotesForTitle, toggleQuote } from "../lib/quotes/sync";
import {
  getStarsForTitle,
  hydrateStarsForTitle,
  toggleLove,
  toggleStar,
} from "../lib/stars/sync";
import { MAX_LOVED_PER_TITLE } from "../lib/stars/store";
import { isLoggedIn } from "../lib/auth/session";
import { createParallelPack } from "../lib/parallels/api";
import {
  followScrollTop,
  offsetsForSizes,
  VIRTUAL_LIST_GAP,
  visibleWindow,
} from "../lib/ui/virtualWindow";
import { fetchAvatarObjectUrl, isAuthApiEnabled } from "../lib/auth/api";
import { getStoredUser, isLocalDevSession } from "../lib/auth/session";
import { sceneLinesFor } from "../lib/content/stillsLines";
import {
  lineAtMovieMs,
  linesNearClock,
  movieMsAtPhrase,
  movieMsSinceLock,
  type TimedLine,
} from "../lib/watch/followClock";
import { getLineNotesForTitle, saveLineNote, type LineNote } from "../lib/watch/lineNotes";
import { createHeardLog } from "../lib/watch/heardLog";
import { openSpeechListener, speechRecognitionSupported, type SpeechListener } from "../lib/watch/speechListener";
import { matchHeardWindow, matchSpokenLine, type SpokenLine } from "../lib/watch/spokenMatch";
import { LineSendControl } from "./LineSendControl";
import { PosterArt } from "./PosterArt";

const PACK_MIN = 3;
/** Room for a full scene (e.g. Wolf lunch), not just a short beat. */
const PACK_MAX = 500;
const ROW_ESTIMATE = 92;
const ROW_ESTIMATE_WITH_PREV = 148;
const ROW_ESTIMATE_WITH_STILL = 176;
const ROW_OVERSCAN = 10;
const FOLLOW_TICK_MS = 250;
const QUIET_HINT_MS = 5000;
/** How often the words already heard are matched again. */
const REVIEW_EVERY_MS = 5_000;
const REVIEW_WINDOW_START_MS = 5_000;
const REVIEW_WINDOW_STEP_MS = 5_000;
const REVIEW_WINDOW_MAX_MS = 30_000;
/** Once the clock is running, re-sync from the words just heard, not a long stretch. */
const TRACK_REVIEW_START_MS = 8_000;
const TRACK_REVIEW_MAX_MS = 16_000;
/** A final that covers this much speech is a stretch, not one cue. */
const LONG_PHRASE_MS = 4_000;
const QUIET_HINT =
  "Still quiet. Chrome’s microphone for this site is the lock icon in the address bar. This page can’t choose it. If this tab is inside the editor, open it in Chrome.";

type SyncPhase =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "tracking"; startMs: number; heardAt: number; lineIndex: number }
  | { kind: "held" };

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
  const [showStills, setShowStills] = useState(false);
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
  const [syncPhase, setSyncPhase] = useState<SyncPhase>({ kind: "idle" });
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [heardPreview, setHeardPreview] = useState("");
  /** Line the list should keep on screen while Sync is showing or following it. */
  const [pinnedLine, setPinnedLine] = useState<number | null>(null);
  const notePerson = useSessionFace();
  const listenRef = useRef<SpeechListener | null>(null);
  const hintTimerRef = useRef(0);
  const heardPreviewRef = useRef("");
  const lastFinalRef = useRef("");
  const heardLogRef = useRef(createHeardLog());
  const reviewTimerRef = useRef(0);
  const reviewWindowRef = useRef(REVIEW_WINDOW_START_MS);
  const reviewHeardRef = useRef<() => void>(() => {});
  const syncPhaseRef = useRef<SyncPhase>({ kind: "idle" });
  const spokenLinesRef = useRef<Array<SpokenLine & TimedLine>>([]);
  const skipSpokenRef = useRef<{ heard: string; lineIndex: number } | null>(null);
  /** They scrolled the list. Sync keeps selecting, and does not move the list until Current line. */
  const followHoldRef = useRef(false);
  const [followPaused, setFollowPaused] = useState(false);
  const ignoreScrollUntilRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      await hydrateStarsForTitle(entry.id);
      await hydrateQuotesForTitle(entry.id);
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
    setSyncPhase({ kind: "idle" });
    setSyncMessage(null);
    setSyncHint(null);
    setHeardPreview("");
    heardPreviewRef.current = "";
    window.clearTimeout(hintTimerRef.current);
    window.clearTimeout(reviewTimerRef.current);
    heardLogRef.current.clear();
    followHoldRef.current = false;
    setFollowPaused(false);
    setPinnedLine(null);
    skipSpokenRef.current = null;
    listenRef.current?.close();
    listenRef.current = null;
  }, [entry.id]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hintTimerRef.current);
      window.clearTimeout(reviewTimerRef.current);
      listenRef.current?.close();
    };
  }, []);

  const promptIndices = useMemo(
    () => (title ? getValidPromptIndices(title) : []),
    [title],
  );
  const promptSet = useMemo(() => new Set(promptIndices), [promptIndices]);
  const spokenLines = useMemo(() => {
    if (!title) return [];
    const rows: Array<SpokenLine & TimedLine> = [];
    for (const line of title.lines) {
      if (promptSet.has(line.index) && line.text) {
        rows.push({ index: line.index, text: line.text, startMs: line.startMs });
      }
    }
    return rows;
  }, [title, promptSet]);
  const followLines = useMemo(() => {
    if (!title) return [];
    const rows: TimedLine[] = [];
    for (const line of title.lines) {
      if (promptSet.has(line.index)) rows.push({ index: line.index, startMs: line.startMs });
    }
    return rows;
  }, [title, promptSet]);
  spokenLinesRef.current = spokenLines;
  syncPhaseRef.current = syncPhase;
  const sceneFrames = useMemo(() => new Set(sceneLinesFor(entry.id)), [entry.id]);

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

  const quotedLines = useMemo(() => {
    const quoted = new Set<number>();
    const wikiquote = new Set<number>();
    for (const quote of getQuotesForTitle(entry.id)) {
      quoted.add(quote.lineIndex);
      if (quote.origin === "wikiquote") wikiquote.add(quote.lineIndex);
    }
    return { quoted, wikiquote };
  }, [entry.id, revision]);

  const notesByLine = useMemo(() => {
    const notes = new Map<number, LineNote>();
    for (const note of getLineNotesForTitle(entry.id)) notes.set(note.lineIndex, note);
    return notes;
  }, [entry.id, revision]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const listRef = useRef<HTMLDivElement>(null);
  const sizeMapRef = useRef(new Map<number, number>());
  const prevOffsetsRef = useRef<number[] | null>(null);
  const layoutKey = `${entry.id}:${showPreviousLines ? 1 : 0}:${showStills ? 1 : 0}`;
  const layoutKeyRef = useRef(layoutKey);
  if (layoutKeyRef.current !== layoutKey) {
    layoutKeyRef.current = layoutKey;
    sizeMapRef.current.clear();
  }
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

  const handleRowHeight = useCallback((lineIndex: number, height: number) => {
    if (sizeMapRef.current.get(lineIndex) === height) return;
    sizeMapRef.current.set(lineIndex, height);
    // Set state from the row itself. A parent layout effect runs too early to see this write,
    // which left every short line sitting in the tall estimated slot.
    setSizeRev((value) => value + 1);
  }, []);

  useEffect(() => {
    // A Sync pin owns the scroll. Clearing the filter to reveal that line must not jump to the top.
    if (pinnedLine !== null) return;
    // Keep scroll position free for focusLineIndex jump from global search.
    if (typeof focusLineIndex === "number" && !didFocusRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [query, starredOnly, entry.id, focusLineIndex]);

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
    const base = showPreviousLines ? ROW_ESTIMATE_WITH_PREV : ROW_ESTIMATE;
    const stillExtra = ROW_ESTIMATE_WITH_STILL - ROW_ESTIMATE;
    const sizes = filteredIndices.map((lineIndex) => {
      const measured = sizeMapRef.current.get(lineIndex);
      if (measured != null) return measured;
      return showStills && sceneFrames.has(lineIndex) ? base + stillExtra : base;
    });
    return offsetsForSizes(sizes, VIRTUAL_LIST_GAP);
  }, [filteredIndices, showPreviousLines, showStills, sceneFrames, sizeRev]);

  const totalSize = offsets[filteredIndices.length] ?? 0;

  // Measured rows above the viewport shrink the list. Keep the same line on screen.
  useLayoutEffect(() => {
    const el = listRef.current;
    const prev = prevOffsetsRef.current;
    prevOffsetsRef.current = offsets;
    if (!el || !prev || prev.length !== offsets.length) return;
    const current = el.scrollTop;
    if (current <= 0) return;
    let anchor = 0;
    for (let i = 0; i < prev.length - 1; i++) {
      if ((prev[i + 1] ?? 0) > current) {
        anchor = i;
        break;
      }
    }
    const delta = (offsets[anchor] ?? 0) - (prev[anchor] ?? 0);
    if (delta === 0) return;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    ignoreScrollUntilRef.current = performance.now() + 300;
    el.scrollTop = next;
    setScrollTop(next);
  }, [offsets]);

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

  const pinLine = useCallback((lineIndex: number) => {
    setHighlightLine((current) => (current === lineIndex ? current : lineIndex));
    setPinnedLine((current) => (current === lineIndex ? current : lineIndex));
  }, []);

  const scrollToCurrentLine = useCallback(() => {
    followHoldRef.current = false;
    setFollowPaused(false);
  }, []);

  useLayoutEffect(() => {
    if (pinnedLine === null || followHoldRef.current) return;
    const pos = filteredIndices.indexOf(pinnedLine);
    if (pos < 0) return;
    const el = listRef.current;
    if (!el) return;
    const top = offsets[pos] ?? 0;
    const nextTop = offsets[pos + 1] ?? top;
    const lineHeight = Math.max(0, nextTop - top - VIRTUAL_LIST_GAP);
    const next = followScrollTop(top, lineHeight, el.clientHeight);
    if (Math.abs(el.scrollTop - next) <= 1) return;
    ignoreScrollUntilRef.current = performance.now() + 300;
    el.scrollTop = next;
    setScrollTop(next);
  }, [pinnedLine, filteredIndices, offsets, followPaused]);

  useEffect(() => {
    if (syncPhase.kind !== "tracking" || pinnedLine === null) return;
    if (filteredIndices.includes(pinnedLine)) return;
    setQuery("");
    setStarredOnly(false);
  }, [syncPhase, pinnedLine, filteredIndices]);

  useEffect(() => {
    if (syncPhase.kind !== "tracking") return;
    const tick = () => {
      const movieMs = movieMsSinceLock(syncPhase.startMs, syncPhase.heardAt, Date.now());
      const next = lineAtMovieMs(followLines, movieMs);
      if (next === null) return;
      pinLine(next);
    };
    tick();
    const id = window.setInterval(tick, FOLLOW_TICK_MS);
    return () => window.clearInterval(id);
  }, [syncPhase, followLines, pinLine]);

  function stopListening() {
    window.clearTimeout(hintTimerRef.current);
    window.clearTimeout(reviewTimerRef.current);
    listenRef.current?.close();
    listenRef.current = null;
  }

  function scheduleReview() {
    window.clearTimeout(reviewTimerRef.current);
    reviewTimerRef.current = window.setTimeout(() => {
      reviewHeardRef.current();
    }, REVIEW_EVERY_MS);
  }

  function nextCueStart(afterIndex: number, afterMs: number): number | null {
    for (const row of spokenLinesRef.current) {
      if (row.startMs < afterMs || row.index === afterIndex) continue;
      return row.startMs;
    }
    return null;
  }

  function lockHeardLine(lineIndex: number, heardAt: number, phraseComplete: boolean) {
    const line = title ? getLine(title, lineIndex) : undefined;
    if (!line) return;
    const movieAt = movieMsAtPhrase(line, nextCueStart(lineIndex, line.endMs), phraseComplete);
    const phase = syncPhaseRef.current;
    if (phase.kind === "tracking" && phase.lineIndex === lineIndex) {
      const running = movieMsSinceLock(phase.startMs, phase.heardAt, heardAt);
      // The same line dated from its first word would pull a finished cue backward.
      if (movieAt < running - 500) {
        reviewWindowRef.current = TRACK_REVIEW_START_MS;
        scheduleReview();
        return;
      }
    }
    skipSpokenRef.current = null;
    const next = {
      kind: "tracking" as const,
      startMs: movieAt,
      heardAt,
      lineIndex,
    };
    syncPhaseRef.current = next;
    setSyncPhase(next);
    const shown = lineAtMovieMs(followLines, movieAt) ?? lineIndex;
    pinLine(shown);
    reviewWindowRef.current = TRACK_REVIEW_START_MS;
    scheduleReview();
  }

  function spokenPool() {
    const phase = syncPhaseRef.current;
    if (phase.kind !== "tracking") return spokenLinesRef.current;
    return linesNearClock(
      spokenLinesRef.current,
      movieMsSinceLock(phase.startMs, phase.heardAt, Date.now()),
    );
  }

  function skipFor(text: string): number | undefined {
    const skip = skipSpokenRef.current;
    if (!skip) return undefined;
    if (text === skip.heard || (skip.heard && text.includes(skip.heard))) return skip.lineIndex;
    return undefined;
  }

  reviewHeardRef.current = () => {
    const phase = syncPhaseRef.current;
    if (phase.kind !== "listening" && phase.kind !== "tracking") return;
    const tracking = phase.kind === "tracking";
    const cap = tracking ? TRACK_REVIEW_MAX_MS : REVIEW_WINDOW_MAX_MS;
    const tokens = heardLogRef.current.tokensSince(Date.now() - Math.min(reviewWindowRef.current, cap));
    const joined = tokens.map((token) => token.token).join(" ");
    const match = matchHeardWindow(tokens, spokenPool(), skipFor(joined));
    if (!match) {
      reviewWindowRef.current = Math.min(cap, reviewWindowRef.current + REVIEW_WINDOW_STEP_MS);
      scheduleReview();
      return;
    }
    lockHeardLine(match.lineIndex, match.heardAt, false);
  };

  function beginListening() {
    stopListening();
    setQuery("");
    setStarredOnly(false);
    setSyncMessage(null);
    setSyncHint(null);
    setHeardPreview("");
    heardPreviewRef.current = "";
    lastFinalRef.current = "";
    heardLogRef.current.clear();
    reviewWindowRef.current = REVIEW_WINDOW_START_MS;
    followHoldRef.current = false;
    setFollowPaused(false);
    setPinnedLine(null);
    if (!speechRecognitionSupported()) {
      setSyncPhase({ kind: "idle" });
      setSyncMessage("This browser has no speech recognition. Open this page in Chrome.");
      return;
    }
    const listening = { kind: "listening" as const };
    syncPhaseRef.current = listening;
    setSyncPhase(listening);
    hintTimerRef.current = window.setTimeout(() => {
      if (!heardPreviewRef.current) setSyncHint(QUIET_HINT);
    }, QUIET_HINT_MS);
    scheduleReview();
    listenRef.current = openSpeechListener({
      onPhrase: (phrase, isFinal) => {
        heardPreviewRef.current = phrase;
        setHeardPreview(phrase);
        if (phrase) setSyncHint(null);
        const at = Date.now();
        if (!isFinal) {
          heardLogRef.current.interim(phrase, at);
          return;
        }
        if (phrase === lastFinalRef.current) return;
        lastFinalRef.current = phrase;
        const span = heardLogRef.current.final(phrase, at);
        if (span && span.endedAt - span.startedAt >= LONG_PHRASE_MS) {
          reviewHeardRef.current();
          return;
        }
        const match = matchSpokenLine(phrase, spokenPool(), skipFor(phrase));
        if (!match) return;
        lockHeardLine(match.lineIndex, at, true);
      },
      onNotice: (message) => setSyncHint(message),
      onError: (message) => {
        stopListening();
        setSyncHint(null);
        setSyncPhase({ kind: "idle" });
        syncPhaseRef.current = { kind: "idle" };
        setSyncMessage(message);
      },
    });
  }

  function rejectLock() {
    const phase = syncPhaseRef.current;
    if (phase.kind !== "tracking") return;
    skipSpokenRef.current = { heard: heardPreviewRef.current, lineIndex: phase.lineIndex };
    const listening = { kind: "listening" as const };
    syncPhaseRef.current = listening;
    setSyncPhase(listening);
    setPinnedLine(null);
  }

  async function handleToggle(lineIndex: number, text: string) {
    await toggleStar(entry.id, lineIndex, text);
    setStarredCount(getStarsForTitle(entry.id).length);
    setRevision((value) => value + 1);
  }

  async function handleQuote(lineIndex: number) {
    await toggleQuote(entry.id, lineIndex);
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
          {entry.title} · {starredCount} starred
          {quotedLines.wikiquote.size > 0 ? ` · ${quotedLines.wikiquote.size} from Wikiquote` : ""} ·{" "}
          {promptIndices.length} quiz lines
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
        <label className="curate-filter">
          <input
            type="checkbox"
            checked={showStills}
            onChange={(event) => setShowStills(event.target.checked)}
          />
          Scene stills
        </label>
      </div>

      <div className="curate-sync">
        <button
          type="button"
          className={`button${syncPhase.kind === "listening" || syncPhase.kind === "tracking" ? " is-listening" : " primary"}`}
          aria-pressed={syncPhase.kind === "listening" || syncPhase.kind === "tracking"}
          onClick={() => {
            if (syncPhase.kind === "listening" || syncPhase.kind === "tracking") {
              stopListening();
              const next = syncPhase.kind === "tracking" ? { kind: "held" as const } : { kind: "idle" as const };
              syncPhaseRef.current = next;
              setSyncPhase(next);
              setSyncHint(null);
              setHeardPreview("");
              heardPreviewRef.current = "";
              if (next.kind === "idle") setPinnedLine(null);
              return;
            }
            beginListening();
          }}
        >
          {syncPhase.kind === "listening" || syncPhase.kind === "tracking" ? "Stop" : "Sync"}
        </button>
        {syncPhase.kind === "listening" ? (
          <p className="muted curate-sync-status" role="status">
            {heardPreview ? `Hearing “${heardPreview}”` : "Listening for a line…"}
          </p>
        ) : null}
        {syncPhase.kind === "listening" && syncHint ? (
          <p className="muted curate-sync-hint" role="status">
            {syncHint}
          </p>
        ) : null}
        {syncPhase.kind === "tracking" && highlightLine !== null ? (
          <p className="muted curate-sync-status" role="status">
            Following line {highlightLine + 1}.
            {followPaused
              ? " The list stays where you scrolled."
              : " The mic stays on for the next line."}
          </p>
        ) : null}
        {syncPhase.kind === "tracking" ? (
          <button type="button" className="button ghost" onClick={rejectLock}>
            Not this
          </button>
        ) : null}
        {syncPhase.kind === "held" && highlightLine !== null ? (
          <p className="muted curate-sync-status" role="status">
            Held on line {highlightLine + 1}. Tap Sync after a pause or a seek.
          </p>
        ) : null}
        {syncMessage ? (
          <p className="share-message" role="status">
            {syncMessage}
          </p>
        ) : null}
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
        <div className="curate-list-frame">
        {followPaused && pinnedLine !== null && (syncPhase.kind === "tracking" || syncPhase.kind === "held") ? (
          <button type="button" className="curate-current-line is-top" onClick={scrollToCurrentLine}>
            Current line
          </button>
        ) : null}
        <div
          className="curate-list"
          role="list"
          ref={listRef}
          onScroll={(event) => {
            const top = event.currentTarget.scrollTop;
            setScrollTop(top);
            if (performance.now() < ignoreScrollUntilRef.current) return;
            const phase = syncPhaseRef.current.kind;
            if (phase !== "tracking" && phase !== "held") return;
            if (pinnedLine === null || followHoldRef.current) return;
            const pos = filteredIndices.indexOf(pinnedLine);
            if (pos < 0) return;
            const lineTop = offsets[pos] ?? 0;
            const nextTop = offsets[pos + 1] ?? lineTop;
            const lineHeight = Math.max(0, nextTop - lineTop - VIRTUAL_LIST_GAP);
            const target = followScrollTop(lineTop, lineHeight, event.currentTarget.clientHeight);
            if (Math.abs(top - target) <= 2) return;
            followHoldRef.current = true;
            setFollowPaused(true);
          }}
        >
          <div className="curate-list-canvas" style={{ height: totalSize }}>
            {visibleIndices.map((lineIndex, visibleOffset) => {
              const line = getLine(title, lineIndex);
              if (!line) return null;

              const starred = starSets.starred.has(lineIndex);
              const loved = starSets.loved.has(lineIndex);
              const quoted = quotedLines.quoted.has(lineIndex);
              const fromWikiquote = quotedLines.wikiquote.has(lineIndex);
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
                  layoutKey={layoutKey}
                  className={`curate-item${starred ? " starred" : ""}${loved ? " loved" : ""}${quoted ? " quoted" : ""}${isSelected ? " selected" : ""}${isFocused ? " focused" : ""}`}
                  onHeight={handleRowHeight}
                >
                  <LineNoteField
                    text={notesByLine.get(lineIndex)?.text ?? ""}
                    person={notePerson}
                    onSave={(words) => {
                      saveLineNote(entry.id, lineIndex, words);
                      setRevision((value) => value + 1);
                    }}
                    marks={
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
                    }
                    icons={
                      <>
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
                        <button
                          type="button"
                          className={`curate-quote${quoted ? " quoted" : ""}`}
                          aria-pressed={quoted}
                          aria-label={quoted ? "Remove quote mark" : "Mark line as a quote"}
                          onClick={() => void handleQuote(lineIndex)}
                        >
                          “
                        </button>
                      </>
                    }
                  >
                    {showStills && sceneFrames.has(lineIndex) ? (
                      <PosterArt
                        titleId={entry.id}
                        title={entry.title}
                        lineIndex={lineIndex}
                        fallback="hide"
                        lazy
                        className="curate-still"
                      />
                    ) : null}
                    <span className="curate-line-index">Line {lineIndex + 1}</span>
                    {showPreviousLines &&
                      leadInForPrompt(title, lineIndex).map((lead) => (
                        <p key={lead.lineIndex} className="curate-lead-in">
                          {lead.text}
                        </p>
                      ))}
                    <p className="curate-text">{line.text}</p>
                    {fromWikiquote ? <span className="curate-origin">Wikiquote</span> : null}
                  </LineNoteField>
                  <LazyLineSendControl
                    titleId={entry.id}
                    lineIndex={lineIndex}
                    streakIndices={streakForSend(promptIndices, [...starSets.starred], lineIndex)}
                  />
                </CurateLineItem>
              );
            })}
          </div>
        </div>
        {followPaused && pinnedLine !== null && (syncPhase.kind === "tracking" || syncPhase.kind === "held") ? (
          <button type="button" className="curate-current-line is-bottom" onClick={scrollToCurrentLine}>
            Current line
          </button>
        ) : null}
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
  layoutKey: string;
  className: string;
  onHeight: (lineIndex: number, height: number) => void;
  children: ReactNode;
};

function CurateLineItem({
  lineIndex,
  rowIndex,
  setSize,
  offset,
  layoutKey,
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
  }, [lineIndex, onHeight, layoutKey]);

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

function LineNoteField({
  text,
  person,
  onSave,
  marks,
  icons,
  children,
}: {
  text: string;
  person: SessionFace;
  onSave: (words: string) => void;
  marks: ReactNode;
  icons: ReactNode;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [editing, text]);

  return (
    <>
      <div className="curate-controls">
        {marks}
        <div className="curate-mark-stack">
          <div className="curate-marks">{icons}</div>
          <button
            type="button"
            className={`button ghost curate-note-open${text ? " has-note" : ""}`}
            aria-label={text ? "Edit note" : "Add a note"}
            onClick={() => setEditing(true)}
          >
            Note
          </button>
        </div>
      </div>
      <div className="curate-copy">
        {children}
        {editing ? (
          <form
            className="curate-note"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(draft);
              setEditing(false);
            }}
          >
            <PersonMark label={person.label} src={person.src} />
            <div className="curate-note-body">
              <label>
                <span className="sr-only">Note on this line</span>
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="What the room said"
                  autoFocus
                />
              </label>
              <div className="curate-note-actions">
                <button type="submit" className="button primary">
                  Save note
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setDraft(text);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        ) : text ? (
          <div className="curate-note">
            <PersonMark label={person.label} src={person.src} />
            <p className="curate-note-text">{text}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

type SessionFace = { label: string; src: string | null };

function useSessionFace(): SessionFace {
  const user = getStoredUser();
  const label = user?.displayName?.trim() || "You";
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !user.avatarAt || !isAuthApiEnabled() || isLocalDevSession()) return;
    let url: string | null = null;
    let cancelled = false;
    void fetchAvatarObjectUrl(user.id).then((next) => {
      if (cancelled) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      url = next;
      setSrc(next);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [user?.id, user?.avatarAt]);

  return { label, src };
}

function PersonMark({ label, src }: { label: string; src: string | null }) {
  return (
    <span className="curate-note-person" title={label}>
      {src ? (
        <img src={src} alt={label} />
      ) : (
        <svg viewBox="0 0 24 24" role="img" aria-label={label}>
          <circle cx="12" cy="12" r="12" />
          <circle className="is-face" cx="12" cy="9.2" r="3.1" />
          <path className="is-face" d="M5.8 18.6a6.4 6.4 0 0 1 12.4 0" />
        </svg>
      )}
    </span>
  );
}

/** Avoid mounting ~3k send menus; hydrate on hover/focus/click. */
function LazyLineSendControl({
  titleId,
  lineIndex,
  streakIndices,
}: {
  titleId: string;
  lineIndex: number;
  streakIndices: number[] | null;
}) {
  const [active, setActive] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  if (active) {
    return (
      <LineSendControl
        titleId={titleId}
        lineIndex={lineIndex}
        streakIndices={streakIndices}
        autoOpen={openOnMount}
      />
    );
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
