import { useEffect, useRef, useState } from "react";
import type { Title } from "../types/content";
import { GAME_MODES } from "../types/game";
import type { McqQuestion } from "../lib/game/mcq";
import { canGoBack, isForgivingMcq, type GameRun } from "../lib/game/session";
import { isStarred, toggleStar } from "../lib/stars/sync";
import { HistorySidebar } from "./HistorySidebar";
import { PosterArt } from "./PosterArt";

/** Hold the illuminated correct choice before advancing (Fun skip + any correct). */
export const CORRECT_HOLD_MS = 2000;
const WRONG_HOLD_MS = 900;

/** Later: cycle Nice / Wow / N streak. */
function correctPopLabel(): string {
  return "Correct";
}

function formatScoreCredit(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

type Props = {
  title: Title;
  run: GameRun;
  question: McqQuestion;
  feedback: "correct" | "wrong" | "skipped" | null;
  skipReveal: string | null;
  progress: string;
  onChoose: (lineIndex: number) => void;
  onSkip: () => void;
  onGoBack: () => void;
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
  onGoBack,
  onQuit,
  onFeedbackDone,
}: Props) {
  const [starred, setStarred] = useState(() =>
    isStarred(title.id, question.promptLineIndex),
  );
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [scorePulse, setScorePulse] = useState<"up" | "down" | null>(null);
  const onFeedbackDoneRef = useRef(onFeedbackDone);
  onFeedbackDoneRef.current = onFeedbackDone;

  useEffect(() => {
    setStarred(isStarred(title.id, question.promptLineIndex));
    setPickedIndex(null);
  }, [title.id, question.promptLineIndex]);

  useEffect(() => {
    if (!feedback) {
      setPickedIndex(null);
      return;
    }
    if (feedback === "skipped" && run.mode === "teach") return;
    const delay = feedback === "wrong" ? WRONG_HOLD_MS : CORRECT_HOLD_MS;
    const timer = window.setTimeout(() => onFeedbackDoneRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [feedback, run.mode]);

  useEffect(() => {
    if (feedback === "correct") setScorePulse("up");
    else if (feedback === "wrong") setScorePulse("down");
    else return;
    const timer = window.setTimeout(() => setScorePulse(null), 700);
    return () => window.clearTimeout(timer);
  }, [feedback, run.correctCount, run.wrongCount]);

  const modeLabel = GAME_MODES.find((item) => item.id === run.mode)?.label ?? run.mode;
  const lengthLabel = run.length === "mini" ? "Mini" : "Full";
  const teachSkipOpen = run.mode === "teach" && feedback === "skipped" && Boolean(skipReveal);

  function handleToggleStar() {
    void toggleStar(title.id, question.promptLineIndex, question.promptText).then(setStarred);
  }

  function handleChoose(lineIndex: number) {
    setPickedIndex(lineIndex);
    onChoose(lineIndex);
  }

  return (
    <>
    <div className="play-layout">
      <section className="panel play-panel">
        <div className="play-toolbar">
          <button type="button" className="button ghost" onClick={onQuit}>
            ← Library
          </button>
          <div className="play-stats">
            <span className="mode-badge">{modeLabel}</span>
            <span className="mode-badge length-badge">{lengthLabel}</span>
            <span>{progress}</span>
            <span
              className={`play-score${scorePulse ? ` pulse-${scorePulse}` : ""}`}
            >
              ✓ {run.correctCount} · ✗ {run.wrongCount}
              {run.skipCount > 0 ? ` · skip ${run.skipCount}` : ""}
              {" · "}
              {formatScoreCredit(run.scoreCredit)} pts
            </span>
          </div>
        </div>

        <p className="episode-label">{title.title}</p>

        <div className={run.length === "mini" ? "play-prompt-row" : undefined}>
          {run.length === "mini" && (
            <PosterArt
              titleId={title.id}
              title={title.title}
              lineIndex={question.promptLineIndex}
              className="play-poster"
            />
          )}
          <div className="prompt-block">
          <div className="prompt-header">
            <p className="prompt-label">
              Current line
              {question.leadIn.length > 0 ? (
                <span className="prompt-lead-in-flag">
                  {" "}
                  · with previous {question.leadIn.length === 1 ? "line" : "lines"}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className={`star-button${starred ? " starred" : ""}`}
              aria-pressed={starred}
              aria-label={starred ? "Unstar this line" : "Star this line for mini-games"}
              onClick={handleToggleStar}
            >
              {starred ? "★ Starred" : "☆ Star"}
            </button>
          </div>
          <blockquote className="prompt-text">
            {question.leadIn.map((line) => (
              <p key={line.lineIndex} className="prompt-lead-in">
                {line.text}
              </p>
            ))}
            <p className="prompt-current">{question.promptText}</p>
          </blockquote>
        </div>
        </div>

        <div className="question-block">
          <p className="prompt-label">What comes next?</p>
          <ul className="choice-list">
            {question.choices.map((choice) => {
              const isPicked = pickedIndex === choice.lineIndex;
              const showCorrect =
                (feedback === "correct" || feedback === "skipped") &&
                choice.lineIndex === question.correctLineIndex;
              const choiceClass = [
                "choice-button",
                showCorrect ? "is-correct" : "",
                isPicked && feedback === "wrong" ? "is-wrong" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={choice.lineIndex}>
                  <button
                    type="button"
                    className={choiceClass}
                    disabled={feedback === "correct" || feedback === "skipped"}
                    onClick={() => handleChoose(choice.lineIndex)}
                  >
                    {choice.text}
                    {feedback === "correct" && showCorrect && (
                      <span className="choice-hit-tag">{correctPopLabel()}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {isForgivingMcq(run.mode) && (
          <div className="skip-row">
            {canGoBack(run) && (
              <button
                type="button"
                className="button ghost"
                disabled={feedback !== null}
                onClick={onGoBack}
              >
                ← Previous question
              </button>
            )}
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
        {feedback === "skipped" && skipReveal && run.mode !== "teach" && (
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

      {teachSkipOpen && (
        <div className="teach-dialog-backdrop">
          <div
            className="teach-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teach-dialog-title"
          >
            <h3 id="teach-dialog-title">The next line</h3>
            <p className="prompt-label">This line</p>
            <blockquote className="teach-dialog-line">{question.promptText}</blockquote>
            <p className="prompt-label">Next line</p>
            <blockquote className="teach-dialog-line teach-dialog-answer">{skipReveal}</blockquote>
            <button type="button" className="button primary" onClick={onFeedbackDone}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
