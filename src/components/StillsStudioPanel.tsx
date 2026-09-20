import { useEffect, useMemo, useRef, useState } from "react";
import {
  approveStudioEpisode,
  fetchStudioEpisode,
  fetchStudioQueue,
  fetchStudioShows,
  openStudioPreview,
  pushStudioEpisode,
  runStudioExtract,
  studioHealth,
  StudioUnavailableError,
  type StudioEpisode,
  type StudioFrame,
  type StudioQueueResponse,
} from "../lib/content/stillsStudioApi";

import { describeStudioMethod, pickNextStudioMethod, recordTriedMethodIds, studioMethodFromId, type StudioMethod, type StudioVote } from "../lib/content/stillsStudioMethods";
import type { StudioExtractMode } from "../lib/content/stillsStudioTypes";

const SIMPSONS_OFFSET_MS = -57_000;

type Props = {
  initialShow?: string;
  initialTitleId?: string | null;
};

function statusLabel(status: StudioEpisode["status"]): string {
  if (status === "no-file") return "no file";
  return status;
}

function formatSeek(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function knobClass(active: boolean): string {
  return `button${active ? " is-active" : ""}`;
}

function formatOffsetLabel(ms: number): string {
  const sec = ms / 1000;
  if (sec === 0) return "0s";
  return `${sec > 0 ? "+" : ""}${Number.isInteger(sec) ? String(sec) : sec.toFixed(1)}s`;
}

type AppliedMethod = {
  offsetMs: number;
  timeScale: number;
  seek: "start" | "mid";
  label: string;
  id?: string;
};

export function StillsStudioPanel({ initialShow = "The Simpsons", initialTitleId = null }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [shows, setShows] = useState<{ show: string; directory: string; directoryExists: boolean }[]>([]);
  const [show, setShow] = useState(initialShow);
  const [queue, setQueue] = useState<StudioQueueResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [episode, setEpisode] = useState<StudioEpisode | null>(null);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [votes, setVotes] = useState<Record<number, StudioVote>>({});
  const [offsetMs, setOffsetMs] = useState(SIMPSONS_OFFSET_MS);
  const [timeScale, setTimeScale] = useState(1);
  const [seek, setSeek] = useState<"start" | "mid">("start");
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});
  const [bust, setBust] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<StudioExtractMode | "push" | null>(null);
  const [busyMethodId, setBusyMethodId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const openedTitleRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function actionLabel(kind: StudioExtractMode | "push", idle: string): string {
    return busyKind === kind && busy ? busy : idle;
  }

  useEffect(() => {
    let cancelled = false;
    void studioHealth().then((ok) => {
      if (cancelled) return;
      setAvailable(ok);
      if (!ok) return;
      void fetchStudioShows()
        .then((list) => {
          if (!cancelled) setShows(list);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof StudioUnavailableError) setAvailable(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (available !== true) return;
    let cancelled = false;
    setError(null);
    void fetchStudioQueue(show)
      .then((next) => {
        if (cancelled) return;
        setQueue(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof StudioUnavailableError) setAvailable(false);
        else setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [available, show]);

  useEffect(() => {
    setShow(initialShow);
  }, [initialShow]);

  useEffect(() => {
    if (!selectedId) return;
    const row = document.querySelector(`[data-title-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId, frames.length]);

  const selected = queue?.episodes.find((row) => row.titleId === selectedId) ?? episode;
  const gallery = selected?.status === "batched" || selected?.status === "pushed";
  const downed = frames.filter((frame) => votes[frame.lineIndex] === "down");
  const allUp = !gallery && frames.length > 0 && frames.every((frame) => votes[frame.lineIndex] === "up");
  const anyDown = !gallery && downed.length > 0;
  const nextMethod = selected
    ? pickNextStudioMethod({
        show,
        fps: selected.fps,
        current: { offsetMs, timeScale, seek },
        triedIds: selected.triedMethodIds,
        votes,
        frameOrder: frames.length > 0 ? frames.map((frame) => frame.lineIndex) : selected.handful,
      })
    : null;
  const triedRecipes = useMemo(() => {
    if (!selected) return [];
    const ids = recordTriedMethodIds(selected.triedMethodIds, selected.methodId);
    return ids
      .map((id) => studioMethodFromId(show, id))
      .filter((row): row is StudioMethod => Boolean(row));
  }, [selected, show]);
  const liveRecipeId = describeStudioMethod(show, { offsetMs, timeScale, seek }).id;

  const counts = useMemo(() => {
    const tallies = { "no-file": 0, ready: 0, review: 0, approved: 0, batched: 0, pushed: 0 };
    for (const row of queue?.episodes ?? []) {
      tallies[row.status] += 1;
    }
    return tallies;
  }, [queue]);

  async function refreshQueue() {
    const next = await fetchStudioQueue(show);
    setQueue(next);
    return next;
  }

  async function loadEpisode(titleId: string, nextQueue?: StudioQueueResponse) {
    const data = await fetchStudioEpisode(titleId);
    const row = nextQueue?.episodes.find((item) => item.titleId === titleId) ?? data.episode;
    setSelectedId(titleId);
    setEpisode(row);
    setFrames(data.frames);
    setOffsetMs(row.offsetMs);
    setTimeScale(row.timeScale);
    setSeek(row.seek);
    setLineOffsets(row.lineOffsets);
    setVotes({});
    if (row.status === "pushed") {
      setNotice(`Pushed ${data.frames.length} stills to R2 from ${data.previewDir}. Live after the next Pages deploy.`);
    } else if (row.status === "batched") {
      setNotice(`Batched ${data.frames.length} stills in ${data.previewDir}. Push to R2 when you mean it.`);
    } else {
      setNotice(null);
    }
  }

  async function selectEpisode(titleId: string) {
    setError(null);
    try {
      await loadEpisode(titleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (available !== true || !initialTitleId || !queue) return;
    if (openedTitleRef.current === initialTitleId) return;
    openedTitleRef.current = initialTitleId;
    if (!queue.episodes.some((row) => row.titleId === initialTitleId)) {
      setError(`That title is not in the ${show} stills queue.`);
      return;
    }
    void selectEpisode(initialTitleId);
  }, [available, initialTitleId, queue, show]);

  async function runExtract(mode: StudioExtractMode, applied?: AppliedMethod) {
    if (!selectedId || busyRef.current) return;
    busyRef.current = true;
    const nextOffset = applied?.offsetMs ?? offsetMs;
    const nextScale = applied?.timeScale ?? timeScale;
    const nextSeek = applied?.seek ?? seek;
    setBusyKind(mode);
    setBusyMethodId(applied?.id ?? null);
    setBusy(
      mode === "batch"
        ? "Extracting remaining stars — this can take a minute…"
        : mode === "smart"
          ? `Trying ${nextMethod?.label ?? "next recipe"}…`
          : mode === "shuffle"
            ? "Picking six other frames…"
            : applied
              ? `Trying ${applied.label}…`
              : "Extracting frames…",
    );
    setError(null);
    setNotice(null);
    try {
      if (mode === "batch") {
        await approveStudioEpisode(selectedId);
      }
      const result = await runStudioExtract({
        titleId: selectedId,
        mode,
        offsetMs: nextOffset,
        timeScale: nextScale,
        lineOffsets,
        seek: nextSeek,
        votes: mode === "smart" ? votes : undefined,
      });
      setEpisode(result.episode);
      setFrames(result.frames);
      setOffsetMs(result.episode.offsetMs);
      setTimeScale(result.episode.timeScale);
      setSeek(result.episode.seek);
      setLineOffsets(result.episode.lineOffsets);
      setBust(Date.now());
      setVotes({});
      await refreshQueue();
      if (mode === "smart" || applied) {
        setNotice(`Now: ${result.method.label}. ${result.method.why}`);
      }
      if (mode === "shuffle") {
        setNotice("Shuffled to six other cues. Tap a previous recipe to retry that timing.");
      }
      if (mode === "batch") {
        setNotice(
          `Batched ${result.extracted} stills in ${result.previewDir}` +
            (result.failed > 0 ? ` · ${result.failed} failed` : "") +
            ".",
        );
      }
      if (result.failed > 0 && mode !== "batch") {
        setError(`${result.failed} frame(s) failed (seek past end of file?).`);
      }
      if (result.durationWarn) {
        setError((prev) => (prev ? `${prev} Remux is shorter than the last cue.` : "Remux is shorter than the last cue."));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(null);
      setBusyKind(null);
      setBusyMethodId(null);
    }
  }

  async function pushApproved() {
    if (!selectedId || busyRef.current) return;
    busyRef.current = true;
    setBusyKind("push");
    setBusy("Pushing to R2…");
    setError(null);
    try {
      const result = await pushStudioEpisode(selectedId);
      setEpisode(result.episode);
      await refreshQueue();
      setNotice(`Pushed ${result.uploaded} stills to R2 from ${result.previewDir}. Live after the next Pages deploy.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(null);
      setBusyKind(null);
    }
  }

  async function openPreviewFolder() {
    if (!selectedId) return;
    setError(null);
    try {
      await openStudioPreview(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function nudgeOffset(deltaMs: number) {
    setOffsetMs((value) => value + deltaMs);
  }

  function nudgeLine(lineIndex: number, deltaMs: number) {
    setLineOffsets((prev) => ({
      ...prev,
      [String(lineIndex)]: (prev[String(lineIndex)] ?? 0) + deltaMs,
    }));
  }

  const themeSkipOn = offsetMs === SIMPSONS_OFFSET_MS;
  const zeroOn = offsetMs === 0;
  const palOn = timeScale === 0.96;
  const midOn = seek === "mid";

  function renderRetryTools(context: "review" | "gallery") {
    const galleryHint = selected?.status === "pushed"
      ? `Wrong timing? Retry six frames — this un-pushes until you batch and push again.${nextMethod ? ` Next up: ${nextMethod.label}.` : " Tap a previous recipe to retry that timing."}`
      : `Wrong timing? Retry six frames — this drops the batch until you thumbs-up again.${nextMethod ? ` Next up: ${nextMethod.label}.` : " Tap a previous recipe to retry that timing."}`;
    return (
      <>
        {triedRecipes.length > 0 ? (
          <div className="stills-tried-row">
            <p className="muted stills-tried">Tried:</p>
            {triedRecipes.map((recipe) => {
              const active = recipe.id === liveRecipeId;
              const pending = busyMethodId === recipe.id;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  className={knobClass(active)}
                  disabled={Boolean(busy)}
                  aria-pressed={active}
                  aria-busy={pending}
                  title={recipe.why}
                  onClick={() =>
                    void runExtract("retry", {
                      id: recipe.id,
                      offsetMs: recipe.offsetMs,
                      timeScale: recipe.timeScale,
                      seek: recipe.seek,
                      label: recipe.label,
                    })
                  }
                >
                  {pending && busy ? busy : recipe.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {busyMethodId && busy ? (
          <p className="stills-studio-busy" role="status" aria-live="polite">
            {busy}
          </p>
        ) : null}
        <div className="stills-retry-stack">
          {context === "gallery" ? (
            <p className="muted">{galleryHint}</p>
          ) : nextMethod ? (
            <p className="muted">
              {anyDown
                ? `Next: ${nextMethod.label} — ${nextMethod.why}`
                : `Thumb the six, shuffle for other cues, or tap a previous recipe. Next up: ${nextMethod.label}.`}
            </p>
          ) : (
            <p className="muted">Tried every named recipe. Tap one above to retry it on these six, or use the knobs.</p>
          )}
          <div className="row">
            {nextMethod ? (
              <button
                type="button"
                className="button primary"
                disabled={Boolean(busy)}
                aria-busy={busyKind === "smart"}
                onClick={() => void runExtract("smart")}
              >
                {actionLabel("smart", `Smart retry: ${nextMethod.label}`)}
              </button>
            ) : null}
            <button
              type="button"
              className="button"
              disabled={Boolean(busy)}
              aria-busy={busyKind === "shuffle"}
              onClick={() => void runExtract("shuffle")}
            >
              {actionLabel("shuffle", "Shuffle six")}
            </button>
          </div>
          {(busyKind === "smart" || busyKind === "shuffle") && busy ? (
            <p className="stills-studio-busy" role="status" aria-live="polite">
              {busy}
            </p>
          ) : null}
        </div>
        <details className="stills-knobs">
          <summary>More knobs</summary>
          <div className="row">
            <button
              type="button"
              className={knobClass(themeSkipOn)}
              aria-pressed={themeSkipOn}
              onClick={() => setOffsetMs(SIMPSONS_OFFSET_MS)}
            >
              −57s
            </button>
            <button
              type="button"
              className={knobClass(zeroOn)}
              aria-pressed={zeroOn}
              onClick={() => setOffsetMs(0)}
            >
              0
            </button>
            <button
              type="button"
              className={knobClass(palOn)}
              aria-pressed={palOn}
              onClick={() => setTimeScale((value) => (value === 0.96 ? 1 : 0.96))}
            >
              PAL 0.96
            </button>
            <button
              type="button"
              className={knobClass(midOn)}
              aria-pressed={midOn}
              onClick={() => setSeek((value) => (value === "mid" ? "start" : "mid"))}
            >
              Mid-cue
            </button>
          </div>
          <p className="muted">PAL is for 25fps DVD rips. Simpsons NTSC stays off unless late frames drift.</p>
          <p className="muted">
            Offset now {formatOffsetLabel(offsetMs)}. Each tap adds, so +1s three times is +3s.
          </p>
          <div className="row">
            {[-10, -5, -1, 1, 5, 10].map((sec) => {
              const active = offsetMs === sec * 1000;
              return (
                <button
                  key={sec}
                  type="button"
                  className={knobClass(active)}
                  aria-pressed={active}
                  onClick={() => nudgeOffset(sec * 1000)}
                >
                  {sec > 0 ? "+" : ""}
                  {sec}s
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="button"
            disabled={Boolean(busy)}
            aria-busy={busyKind === "retry"}
            onClick={() => void runExtract("retry")}
          >
            {actionLabel("retry", "Re-extract these six")}
          </button>
          {busyKind === "retry" && busy ? (
            <p className="stills-studio-busy" role="status" aria-live="polite">
              {busy}
            </p>
          ) : null}
        </details>
      </>
    );
  }

  if (available === false) {
    return (
      <p className="muted">
        Stills studio is local-only (ffmpeg and G:\videos). Production Pages does not
        serve it — deploying will not help. On this machine run <code>npm run dev</code>{" "}
        and open that localhost URL.
      </p>
    );
  }

  if (available === null) {
    return <p className="muted">Checking stills studio…</p>;
  }

  return (
    <div className="stills-studio">
      <div className="stills-studio-toolbar">
        <label className="stills-studio-show">
          Show
          <select value={show} onChange={(event) => setShow(event.target.value)}>
            {(shows.length > 0 ? shows : [{ show, directory: "", directoryExists: false }]).map((row) => (
              <option key={row.show} value={row.show}>
                {row.show}
                {row.directoryExists ? "" : " (no folder)"}
              </option>
            ))}
          </select>
        </label>
        <p className="muted stills-studio-summary">
          {queue
            ? `${counts.ready} ready · ${counts.review} review · ${counts.batched} batched · ${counts.pushed} pushed · ${counts["no-file"]} no file`
            : "Loading queue…"}
          {queue && !queue.directoryExists ? " · video folder missing" : ""}
          {queue && queue.unmatched.length > 0 ? ` · ${queue.unmatched.length} unmatched files` : ""}
          {queue?.remoteStars ? " · remote D1" : ""}
        </p>
      </div>

      {queue?.starError ? <p className="muted">D1 stars unavailable: {queue.starError}</p> : null}
      {error ? <p className="feedback wrong">{error}</p> : null}
      {notice ? <p className="feedback correct">{notice}</p> : null}

      {selected ? (
        <section className="stills-review">
          <div className="section-header">
            <h3>{selected.label}</h3>
            <p className="muted">
              {selected.starCount} D1 stars · {selected.methodLabel}
              {selected.fps ? ` · ${selected.fps.toFixed(2)} fps` : ""}
              {selected.videoName ? ` · ${selected.videoName}` : ""}
            </p>
          </div>

          {frames.length === 0 ? (
            <div className="stills-retry-stack">
              <button
                type="button"
                className="button primary"
                disabled={Boolean(busy) || selected.status === "no-file"}
                aria-busy={busyKind === "handful"}
                onClick={() => void runExtract("handful")}
              >
                {actionLabel("handful", "Extract 6 frames")}
              </button>
              {busyKind === "handful" && busy ? (
                <p className="stills-studio-busy" role="status" aria-live="polite">
                  {busy}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className={`stills-review-grid${gallery ? " is-gallery" : ""}`}>
                {frames.map((frame) => {
                  const vote = votes[frame.lineIndex];
                  return (
                    <article
                      key={frame.lineIndex}
                      className={`stills-frame-card${vote === "up" ? " is-up" : ""}${vote === "down" ? " is-down" : ""}`}
                    >
                      {frame.ok ? (
                        <img
                          src={`${frame.url}?t=${bust}`}
                          alt=""
                          className="stills-frame-img"
                        />
                      ) : (
                        <div className="stills-frame-missing">{frame.error ?? "No JPEG"}</div>
                      )}
                      <p className="stills-frame-quote">{frame.text}</p>
                      <p className="muted stills-frame-meta">
                        line {frame.lineIndex} · {formatSeek(frame.seekSec)}
                        {frame.extraMs ? ` · extra ${frame.extraMs / 1000}s` : ""}
                      </p>
                      {gallery ? null : (
                        <>
                          <div className="stills-frame-votes">
                            <button
                              type="button"
                              className={`button ghost${vote === "up" ? " is-active" : ""}`}
                              disabled={Boolean(busy)}
                              onClick={() => setVotes((prev) => ({ ...prev, [frame.lineIndex]: "up" }))}
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              className={`button ghost${vote === "down" ? " is-active" : ""}`}
                              disabled={Boolean(busy)}
                              onClick={() => setVotes((prev) => ({ ...prev, [frame.lineIndex]: "down" }))}
                            >
                              👎
                            </button>
                          </div>
                          {vote === "down" ? (
                            <div className="stills-line-nudge">
                              <button type="button" className="button ghost" onClick={() => nudgeLine(frame.lineIndex, -1000)}>
                                line −1s
                              </button>
                              <button type="button" className="button ghost" onClick={() => nudgeLine(frame.lineIndex, 1000)}>
                                line +1s
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              {!gallery && !allUp && frames.length > 0 ? (
                <div className="stills-sync-controls">{renderRetryTools("review")}</div>
              ) : null}

              {gallery ? (
                <div className="stills-sync-controls">
                  <p className="muted">
                    {selected.status === "pushed"
                      ? "On R2. Next Pages deploy still required for live /stills."
                      : "All D1 stars are on disk. Open the folder to skim, or push to R2."}
                  </p>
                  <div className="row">
                    <button type="button" className="button" onClick={() => void openPreviewFolder()}>
                      Open result folder
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={Boolean(busy) || selected.status === "pushed"}
                      aria-busy={busyKind === "push"}
                      onClick={() => void pushApproved()}
                    >
                      {selected.status === "pushed" ? "Pushed to R2" : actionLabel("push", "Push approved")}
                    </button>
                  </div>
                  {busyKind === "push" && busy ? (
                    <p className="stills-studio-busy" role="status" aria-live="polite">
                      {busy}
                    </p>
                  ) : null}
                  {renderRetryTools("gallery")}
                </div>
              ) : null}

              {allUp ? (
                <div className="stills-sync-controls">
                  <p className="muted">All six match. Batch remaining D1 stars locally, then push to R2 when you mean it.</p>
                  <div className="row">
                    <button
                      type="button"
                      className="button primary"
                      disabled={Boolean(busy) || selected.starCount === 0}
                      aria-busy={busyKind === "batch"}
                      onClick={() => void runExtract("batch")}
                    >
                      {selected.starCount === 0
                        ? "No D1 stars to batch"
                        : actionLabel("batch", "Batch remaining stars")}
                    </button>
                    <button type="button" className="button" onClick={() => void openPreviewFolder()}>
                      Open folder
                    </button>
                  </div>
                  {busyKind === "batch" && busy ? (
                    <p className="stills-studio-busy" role="status" aria-live="polite">
                      {busy}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="ops-table-wrap stills-queue-wrap">
        <table className="ops-table stills-queue-table">
          <thead>
            <tr>
              <th>Episode</th>
              <th>Status</th>
              <th>Stars</th>
              <th>Stills</th>
              <th>Offset</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(queue?.episodes ?? []).map((row) => (
              <tr
                key={row.titleId}
                data-title-id={row.titleId}
                className={row.titleId === selectedId ? "is-selected" : ""}
              >
                <td>
                  {row.label}
                  {row.durationWarn ? <span className="muted"> · short file</span> : null}
                </td>
                <td>{statusLabel(row.status)}</td>
                <td>{row.starCount || ""}</td>
                <td>{row.stillCount || ""}</td>
                <td>{row.offsetMs / 1000}s</td>
                <td>
                  {row.status === "no-file" ? null : (
                    <button type="button" className="button ghost" onClick={() => void selectEpisode(row.titleId)}>
                      Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
