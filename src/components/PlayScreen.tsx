import { useEffect } from "react";
import type { Title } from "../types/content";
import type { McqQuestion } from "../lib/game/mcq";
import type { GameRun } from "../lib/game/session";
import { HistorySidebar } from "./HistorySidebar";

type Props = {
  title: Title;
  run: GameRun;
  question: McqQuestion;
  feedback: "correct" | "wrong" | "skipped" | null;
  skipReveal: string | null;
  progress: string;
  onChoose: (lineIndex: number) => void;
  onSkip: () => void;
  onQuit: () => void;
  onFeedbackDone: () => void;
};

export function PlayScreen({
  title,
  run,
  question,
  feedback,
  skipReveal,
  progress,
  onChoose,
  onSkip,
  onQuit,
  onFeedbackDone,
}: Props) {
  useEffect(() => {
    if (!feedback) return;
    const delay = feedback === "wrong" ? 900 : 1200;
    const timer = window.setTimeout(onFeedbackDone, delay);
    return () => window.clearTimeout(timer);
  }, [feedback, onFeedbackDone]);

  const modeLabel = run.mode === "fun" ? "Fun" : run.mode === "medium" ? "Medium" : "Hard";

  return (
    <div className="play-layout">
      <section className="panel play-panel">
        <div className="play-toolbar">
          <button type="button" className="button ghost" onClick={onQuit}>
            ← Library
          </button>
          <div className="play-stats">
            <span className="mode-badge">{modeLabel}</span>
            <span>{progress}</span>
            <span className="muted">
              ✓ {run.correctCount} · ✗ {run.wrongCount}
              {run.skipCount > 0 ? ` · skip ${run.skipCount}` : ""}
            </span>
          </div>
        </div>

        <p className="episode-label">{title.title}</p>

        <div className="prompt-block">
          <p className="prompt-label">Current line</p>
          <blockquote className="prompt-text">{question.promptText}</blockquote>
        </div>

        <div className="question-block">
          <p className="prompt-label">What comes next?</p>
          <ul className="choice-list">
            {question.choices.map((choice) => (
              <li key={choice.lineIndex}>
                <button
                  type="button"
                  className="choice-button"
                  disabled={feedback === "correct" || feedback === "skipped"}
                  onClick={() => onChoose(choice.lineIndex)}
                >
                  {choice.text}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {run.mode === "fun" && (
          <div className="skip-row">
            <button
              type="button"
              className="button ghost"
              disabled={feedback === "correct" || feedback === "skipped"}
              onClick={onSkip}
            >
              Skip — show answer
            </button>
          </div>
        )}

        {feedback === "wrong" && (
          <p className="feedback wrong" role="status">
            Not quite — try again.
          </p>
        )}
        {feedback === "correct" && (
          <p className="feedback correct" role="status">
            Correct!
          </p>
        )}
        {feedback === "skipped" && skipReveal && (
          <p className="feedback skipped" role="status">
            Skipped — it was: “{skipReveal}”
          </p>
        )}
      </section>

      <HistorySidebar
        title={title}
        history={run.history}
        currentLineIndex={run.promptLineIndex}
      />
    </div>
  );
}
