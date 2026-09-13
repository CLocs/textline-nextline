import { useEffect, useState } from "react";
import type { Title } from "../types/content";
import { questionTotal, type GameRun } from "../lib/game/session";
import { fetchSharedRuns, type SharedRun } from "../lib/auth/api";
import { rateRun, type Thumb } from "../lib/runs/api";

type Props = {
  title: Title;
  run: GameRun;
  shareId?: string | null;
  shareOwnerName?: string | null;
  persistedRunId?: string | null;
  onPlayAgain: () => void;
  onBack: () => void;
};

export function CompleteScreen({
  title,
  run,
  shareId,
  shareOwnerName,
  persistedRunId,
  onPlayAgain,
  onBack,
}: Props) {
  const totalQuestions = questionTotal(run, title);
  const finished = run.endReason !== "miss";
  const sessionLabel =
    shareId != null
      ? "Shared mini-game complete"
      : run.length === "mini"
        ? "Mini-game complete"
        : "Episode complete";

  const [leaderboard, setLeaderboard] = useState<SharedRun[]>([]);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    void fetchSharedRuns(shareId).then((runs) => {
      if (!cancelled) setLeaderboard(runs);
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  async function handleThumb(next: Thumb) {
    if (!persistedRunId || ratingBusy) return;
    setRatingBusy(true);
    const ok = await rateRun(persistedRunId, next);
    setRatingBusy(false);
    if (ok) setThumb(next);
  }

  return (
    <section className="panel complete-panel">
      <h2>{finished ? sessionLabel : "Run over"}</h2>
      <p className="episode-label">{title.title}</p>
      {shareOwnerName && (
        <p className="muted">You played {shareOwnerName}&apos;s starred lines.</p>
      )}

      {!finished && (
        <p className="feedback wrong run-over-note">One miss ends the run in {run.mode} mode.</p>
      )}

      <dl className="score-grid">
        <div>
          <dt>Lines guessed</dt>
          <dd>
            {run.correctCount} / {totalQuestions}
          </dd>
        </div>
        <div>
          <dt>Wrong attempts</dt>
          <dd>{run.wrongCount}</dd>
        </div>
        <div>
          <dt>Skips</dt>
          <dd>{run.skipCount}</dd>
        </div>
      </dl>

      {persistedRunId && (
        <>
          <p className="muted">How was this game?</p>
          <div className="row">
            <button
              type="button"
              className={thumb === "up" ? "button primary" : "button ghost"}
              disabled={ratingBusy}
              aria-pressed={thumb === "up"}
              onClick={() => void handleThumb("up")}
            >
              Thumbs up
            </button>
            <button
              type="button"
              className={thumb === "down" ? "button primary" : "button ghost"}
              disabled={ratingBusy}
              aria-pressed={thumb === "down"}
              onClick={() => void handleThumb("down")}
            >
              Thumbs down
            </button>
          </div>
        </>
      )}

      {shareId && leaderboard.length > 0 && (
        <div className="share-leaderboard">
          <h3>Scores on this share</h3>
          <ol className="share-leaderboard-list">
            {leaderboard.map((entry) => (
              <li key={`${entry.playerUserId}-${entry.completedAt}`}>
                <span className="share-leaderboard-name">{entry.displayName}</span>
                <span className="muted">
                  {entry.correctCount} correct · {entry.wrongCount} wrong · {entry.skipCount} skip
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="row">
        <button type="button" className="button primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="button ghost" onClick={onBack}>
          Pick another episode
        </button>
      </div>
    </section>
  );
}
