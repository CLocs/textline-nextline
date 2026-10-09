import { useEffect, useMemo, useRef, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { buildMcq, type McqQuestion } from "../lib/game/mcq";
import { rotateCards, type DailyLine } from "../lib/game/dailyPick";
import { loadInstantCards, loadTodaysCards } from "../lib/game/dailyLoad";
import { completeDaily } from "../lib/game/dailyClient";
import { PosterArt } from "./PosterArt";
import { LineSendControl } from "./LineSendControl";
import { DailyMailPrompt } from "./DailyMailPrompt";

const CHOICE_LABELS = ["A", "B", "C", "D"];
const CORRECT_HOLD_MS = 2000;
const MISS_HOLD_MS = 1400;

type Props = {
  startIndex: number;
  onQuit: () => void;
  /** Instant three does not touch the daily streak. */
  kind?: "daily" | "instant";
};

export function DailyPlayScreen({ startIndex, onQuit, kind = "daily" }: Props) {
  const [cards, setCards] = useState<DailyLine[] | null>(null);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "skipped" | null>(null);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [clean, setClean] = useState(true);
  const [hits, setHits] = useState(0);
  const [finished, setFinished] = useState(false);
  const [streakLabel, setStreakLabel] = useState<string | null>(null);
  const [skipArmed, setSkipArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const scoreRef = useRef({ correctCount: 0, wrongCount: 0, skipCount: 0 });

  useEffect(() => {
    let cancelled = false;
    setStep(0);
    setFinished(false);
    setHits(0);
    scoreRef.current = { correctCount: 0, wrongCount: 0, skipCount: 0 };
    setFeedback(null);
    setPickedIndex(null);
    setClean(true);
    setSkipArmed(false);
    setStreakLabel(null);
    const load = kind === "instant" ? loadInstantCards() : loadTodaysCards();
    void load.then((next) => {
      if (!cancelled) setCards(rotateCards(next, startIndex));
    });
    return () => {
      cancelled = true;
    };
  }, [startIndex, kind]);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!finished || kind !== "daily") return;
    let cancelled = false;
    const total = cards?.length ?? 0;
    const score =
      total > 0 ? { ...scoreRef.current, questionTotal: total } : undefined;
    void completeDaily(undefined, score).then((state) => {
      if (!cancelled) {
        setStreakLabel(state.streak > 0 ? `${state.streak}-day streak` : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [finished, kind, cards]);

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
    if (firstTry) {
      scoreRef.current.correctCount += 1;
      setHits((count) => count + 1);
    }
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
    setSkipArmed(false);
    setPickedIndex(lineIndex);
    if (lineIndex === question.correctLineIndex) {
      const firstTry = clean;
      setFeedback("correct");
      advance(firstTry);
      return;
    }
    setClean(false);
    scoreRef.current.wrongCount += 1;
    setFeedback("wrong");
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setFeedback(null);
      setPickedIndex(null);
    }, MISS_HOLD_MS);
  }

  function handleSkip() {
    if (!question || feedback != null) return;
    setSkipArmed(false);
    setFeedback("skipped");
    scoreRef.current.skipCount += 1;
    setPickedIndex(question.correctLineIndex);
    advance(false);
  }

  if (cards === null) {
    return (
      <section className="panel">
        <p className="muted">{kind === "instant" ? "Loading three quotes…" : "Loading today’s three…"}</p>
      </section>
    );
  }

  if (finished || cards.length === 0) {
    const total = cards.length;
    return (
      <section className="panel daily-result">
        {total > 0 ? <DailyMailPrompt /> : null}
        <h2>{total === 0 ? "Nothing lined up" : kind === "instant" ? "Three quotes" : "Today’s three"}</h2>
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
        {kind === "instant" ? "Play 3" : "Daily"} · {step + 1} of {cards.length}
      </h2>
      {kind === "daily" && card.slot === "global" ? <p className="daily-today-label">Line of the day</p> : null}

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

      <div className="daily-skip">
        {skipArmed ? (
          <>
            <button type="button" className="button ghost daily-skip-cancel" onClick={() => setSkipArmed(false)}>
              Cancel
            </button>
            <button type="button" className="skip-button" disabled={feedback != null} onClick={handleSkip}>
              Reveal answer
            </button>
          </>
        ) : (
          <button type="button" className="skip-button" disabled={feedback != null} onClick={() => setSkipArmed(true)}>
            Show answer
          </button>
        )}
      </div>
      {feedback === "wrong" && <p className="feedback missed">Missed — try again.</p>}
    </section>
  );
}
