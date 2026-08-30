import type { Title } from "../types/content";
import { questionTotal, type GameRun } from "../lib/game/session";

type Props = {
  title: Title;
  run: GameRun;
  onPlayAgain: () => void;
  onBack: () => void;
};

export function CompleteScreen({ title, run, onPlayAgain, onBack }: Props) {
  const totalQuestions = questionTotal(run, title);
  const finished = run.endReason !== "miss";
  const sessionLabel = run.length === "mini" ? "Mini-game complete" : "Episode complete";

  return (
    <section className="panel complete-panel">
      <h2>{finished ? sessionLabel : "Run over"}</h2>
      <p className="episode-label">{title.title}</p>

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
