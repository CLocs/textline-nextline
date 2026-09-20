import { useEffect, useMemo, useState } from "react";
import {
  approveStudioEpisode,
  fetchStudioEpisode,
  fetchStudioQueue,
  fetchStudioShows,
  pushStudioEpisode,
  runStudioExtract,
  studioHealth,
  StudioUnavailableError,
  type StudioEpisode,
  type StudioFrame,
  type StudioQueueResponse,
} from "../lib/content/stillsStudioApi";

type Vote = "up" | "down";

const SIMPSONS_OFFSET_MS = -57_000;

type Props = {
  initialShow?: string;
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

export function StillsStudioPanel({ initialShow = "The Simpsons" }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [shows, setShows] = useState<{ show: string; directory: string; directoryExists: boolean }[]>([]);
  const [show, setShow] = useState(initialShow);
  const [queue, setQueue] = useState<StudioQueueResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [episode, setEpisode] = useState<StudioEpisode | null>(null);
  const [frames, setFrames] = useState<StudioFrame[]>([]);
  const [votes, setVotes] = useState<Record<number, Vote>>({});
  const [offsetMs, setOffsetMs] = useState(SIMPSONS_OFFSET_MS);
  const [timeScale, setTimeScale] = useState(1);
  const [lineOffsets, setLineOffsets] = useState<Record<string, number>>({});
  const [bust, setBust] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const selected = queue?.episodes.find((row) => row.titleId === selectedId) ?? episode;
  const downed = frames.filter((frame) => votes[frame.lineIndex] === "down");
  const allUp = frames.length > 0 && frames.every((frame) => votes[frame.lineIndex] === "up");
  const anyDown = downed.length > 0;

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
    setLineOffsets(row.lineOffsets);
    setVotes({});
  }

  async function selectEpisode(titleId: string) {
    setError(null);
    try {
      await loadEpisode(titleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runExtract(mode: "handful" | "retry" | "batch") {
    if (!selectedId) return;
    setBusy(mode === "batch" ? "Extracting remaining stars…" : "Extracting frames…");
    setError(null);
    try {
      if (mode === "batch") {
        await approveStudioEpisode(selectedId);
      }
      const result = await runStudioExtract({
        titleId: selectedId,
        mode,
        offsetMs,
        timeScale,
        lineOffsets,
      });
      setEpisode(result.episode);
      setFrames(result.frames);
      setOffsetMs(result.episode.offsetMs);
      setTimeScale(result.episode.timeScale);
      setLineOffsets(result.episode.lineOffsets);
      setBust(Date.now());
      if (mode !== "batch") setVotes({});
      await refreshQueue();
      if (result.failed > 0) {
        setError(`${result.failed} frame(s) failed (seek past end of file?).`);
      }
      if (result.durationWarn) {
        setError((prev) => (prev ? `${prev} Remux is shorter than the last cue.` : "Remux is shorter than the last cue."));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function pushApproved() {
    if (!selectedId) return;
    setBusy("Pushing to R2…");
    setError(null);
    try {
      const result = await pushStudioEpisode(selectedId);
      setEpisode(result.episode);
      await refreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
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
      {busy ? <p className="muted">{busy}</p> : null}

      {selected ? (
        <section className="stills-review">
          <div className="section-header">
            <h3>{selected.label}</h3>
            <p className="muted">
              {selected.starCount} D1 stars · offset {offsetMs / 1000}s · scale {timeScale}
              {selected.videoName ? ` · ${selected.videoName}` : ""}
            </p>
          </div>

          {frames.length === 0 ? (
            <button
              type="button"
              className="button primary"
              disabled={Boolean(busy) || selected.status === "no-file"}
              onClick={() => void runExtract("handful")}
            >
              Extract 6 frames
            </button>
          ) : (
            <>
              <div className="stills-review-grid">
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
                      <div className="stills-frame-votes">
                        <button
                          type="button"
                          className={`button ghost${vote === "up" ? " is-active" : ""}`}
                          onClick={() => setVotes((prev) => ({ ...prev, [frame.lineIndex]: "up" }))}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          className={`button ghost${vote === "down" ? " is-active" : ""}`}
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
                    </article>
                  );
                })}
              </div>

              {anyDown ? (
                <div className="stills-sync-controls">
                  <p className="muted">Thumbs down — do not batch. Nudge sync and re-extract these six.</p>
                  <div className="row">
                    <button type="button" className="button" onClick={() => setOffsetMs(SIMPSONS_OFFSET_MS)}>
                      −57s
                    </button>
                    <button type="button" className="button" onClick={() => setOffsetMs(0)}>
                      0
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setTimeScale((value) => (value === 0.96 ? 1 : 0.96))}
                    >
                      PAL 0.96 {timeScale === 0.96 ? "on" : "off"}
                    </button>
                  </div>
                  <div className="row">
                    {[-10, -5, -1, 1, 5, 10].map((sec) => (
                      <button key={sec} type="button" className="button ghost" onClick={() => nudgeOffset(sec * 1000)}>
                        {sec > 0 ? "+" : ""}
                        {sec}s
                      </button>
                    ))}
                  </div>
                  <button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void runExtract("retry")}>
                    Re-extract these six
                  </button>
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
                      onClick={() => void runExtract("batch")}
                    >
                      {selected.starCount === 0 ? "No D1 stars to batch" : "Batch remaining stars"}
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={Boolean(busy) || (selected.status !== "batched" && selected.status !== "pushed")}
                      onClick={() => void pushApproved()}
                    >
                      Push approved
                    </button>
                  </div>
                </div>
              ) : null}

              {!anyDown && !allUp && frames.length > 0 ? (
                <p className="muted">Thumb every frame. Any down keeps you on these six until they match.</p>
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
              <tr key={row.titleId} className={row.titleId === selectedId ? "is-selected" : ""}>
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
