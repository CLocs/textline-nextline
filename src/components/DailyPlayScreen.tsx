import { useEffect, useMemo, useRef, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { buildMcq, type McqQuestion } from "../lib/game/mcq";
import { rotateCards, type DailyLine } from "../lib/game/dailyPick";
import { loadTodaysCards } from "../lib/game/dailyLoad";
import { completeDaily } from "../lib/game/dailyClient";
import { PosterArt } from "./PosterArt";
import { LineSendControl } from "./LineSendControl";

const CHOICE_LABELS = ["A", "B", "C", "D"];
const CORRECT_HOLD_MS = 2000;
const MISS_HOLD_MS = 1400;

type Props = {
  startIndex: number;
  onQuit: () => void;
};

export function DailyPlayScreen({ startIndex, onQuit }: Props) {
  const [cards, setCards] = useState<DailyLine[] | null>(null);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "skipped" | null>(null);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [clean, setClean] = useState(true);
  const [hits, setHits] = useState(0);
  const [finished, setFinished] = useState(false);
  const [streakLabel, setStreakLabel] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStep(0);
    setFinished(false);
    setHits(0);
    setFeedback(null);
    setPickedIndex(null);
    setClean(true);
    setStreakLabel(null);
    void loadTodaysCards().then((next) => {
      if (!cancelled) setCards(rotateCards(next, startIndex));
    });
    return () => {
      cancelled = true;
    };
  }, [startIndex]);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    void completeDaily().then((state) => {
      if (!cancelled) {
        setStreakLabel(state.streak > 0 ? `${state.streak}-day streak` : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [finished]);

  const card = cards?.[step] ?? null;
  const title = card ? getTitle(card.titleId) : null;
  const question = useMemo<McqQuestion | null>(() => {
    if (!title || !card) return null;
    return buildMcq(title, card.lineIndex);
  }, [title, card?.titleId, card?.lineIndex]);

  useEffect(() => {
    if (!cards || finished || question) return;
    if (step + 1 >= cards.length) setFinished(true);
    else setStep((current) => current + 1);
  }, [cards, finished, question, step]);

  function advance(firstTry: boolean) {
    if (firstTry) setHits((count) => count + 1);
    const nextStep = step + 1;
    timer.current = window.setTimeout(() => {
      if (!cards || nextStep >= cards.length) {
        setFinished(true);
        return;
      }
      setStep(nextStep);
      setFeedback(null);
      setPickedIndex(null);
      setClean(true);
    }, CORRECT_HOLD_MS);
  }

  function handleChoose(lineIndex: number) {
    if (!question || feedback === "correct" || feedback === "skipped") return;
    setPickedIndex(lineIndex);
    if (lineIndex === question.correctLineIndex) {
      const firstTry = clean;
      setFeedback("correct");
      advance(firstTry);
      return;
    }
    setClean(false);
    setFeedback("wrong");
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setFeedback(null);
      setPickedIndex(null);
    }, MISS_HOLD_MS);
  }

  function handleSkip() {
    if (!question || feedback != null) return;
    setFeedback("skipped");
    setPickedIndex(question.correctLineIndex);
    advance(false);
  }

  if (cards === null) {
    return (
      <section className="panel">
        <p className="muted">Loading today’s three…</p>
      </section>
    );
  }

  if (finished || cards.length === 0) {
    const total = cards.length;
    return (
      <section className="panel daily-result">
        <h2>{total === 0 ? "Nothing lined up" : "Today’s three"}</h2>
        {total > 0 && (
          <p>
            You got {hits} of {total} on the first try.
          </p>
        )}
        {streakLabel && <p className="streak-badge">{streakLabel}</p>}
        <button type="button" className="button" onClick={onQuit}>
          Back home
        </button>
      </section>
    );
  }

  if (!title || !question || !card) {
    return (
      <section className="panel">
        <p className="muted">Loading the next question…</p>
      </section>
    );
  }

  return (
    <section className="panel play-panel">
      <div className="play-toolbar">
        <button type="button" className="button ghost back-link" onClick={onQuit}>
          ← Home
        </button>
      </div>
      <h2 className="daily-play-title">
        Daily · {step + 1} of {cards.length}
      </h2>

      <p className="episode-label">{title.title}</p>
      <div className="play-prompt-row">
        <PosterArt
          titleId={title.id}
          title={title.title}
          lineIndex={question.promptLineIndex}
          className="play-poster"
        />
        <div className="prompt-block">
          <div className="prompt-header">
            <p className="prompt-label">Current line</p>
            <div className="prompt-header-actions">
              <LineSendControl titleId={title.id} lineIndex={question.promptLineIndex} />
            </div>
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
        <p className="prompt-label">What comes next? Pick one:</p>
        <ul className="choice-list" role="radiogroup" aria-label="Next line choices">
          {question.choices.map((choice, index) => {
            const isPicked = pickedIndex === choice.lineIndex;
            const showCorrect =
              (feedback === "correct" || feedback === "skipped") &&
              choice.lineIndex === question.correctLineIndex;
            const choiceClass = [
              "choice-button",
              showCorrect ? "is-correct" : "",
              isPicked && feedback === "wrong" ? "is-missed" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={choice.lineIndex}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isPicked}
                  className={choiceClass}
                  disabled={feedback === "correct" || feedback === "skipped"}
                  onClick={() => handleChoose(choice.lineIndex)}
                >
                  <span className="choice-letter" aria-hidden="true">
                    <span className="choice-radio" />
                    {CHOICE_LABELS[index] ?? String(index + 1)}
                  </span>
                  <span className="choice-text">{choice.text}</span>
                  {feedback === "correct" && showCorrect && (
                    <span className="choice-hit-tag">Correct</span>
                  )}
                  {feedback === "wrong" && isPicked && <span className="choice-miss-tag">Missed</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="skip-row">
        <button type="button" className="button ghost" disabled={feedback != null} onClick={handleSkip}>
          Skip
        </button>
      </div>
      {feedback === "wrong" && <p className="feedback missed">Missed — try again.</p>}
    </section>
  );
}
