import { useEffect, useMemo, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import { getNextPlayableLine } from "../lib/content/playable";
import { buildMcq } from "../lib/game/mcq";
import type { InboxItem } from "../lib/inbox/api";
import type { CatalogEntry } from "../types/content";

const SOLVED_PREFIX = "textline-inbox-solved:";
const CORRECT_HOLD_MS = 900;

type Props = {
  item: InboxItem;
  entries: CatalogEntry[];
};

function solvedKey(id: string): string {
  return `${SOLVED_PREFIX}${id}`;
}

function readSolved(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(solvedKey(id)) === "1";
}

function writeSolved(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(solvedKey(id), "1");
}

export function InboxLineCard({ item, entries }: Props) {
  const title = getTitle(item.titleId);
  const entry = entries.find((row) => row.id === item.titleId);
  const label = entry ? catalogLabel(entry) : (title?.title ?? item.titleId);
  const question = useMemo(() => {
    const loaded = getTitle(item.titleId);
    return loaded ? buildMcq(loaded, item.lineIndex) : null;
  }, [item.titleId, item.lineIndex]);
  const [solved, setSolved] = useState(() => readSolved(item.id));
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const promptText = title ? (getLine(title, item.lineIndex)?.text ?? "") : "";
  const nextText = title ? (getNextPlayableLine(title, item.lineIndex)?.text ?? "") : "";

  useEffect(() => {
    if (feedback !== "correct") return;
    const timer = window.setTimeout(() => {
      writeSolved(item.id);
      setSolved(true);
    }, CORRECT_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [feedback, item.id]);

  function handleChoose(lineIndex: number) {
    if (!question || solved || feedback === "correct") return;
    setPickedIndex(lineIndex);
    if (lineIndex === question.correctLineIndex) {
      setFeedback("correct");
      return;
    }
    setFeedback("wrong");
  }

  return (
    <article className={`inbox-line-card${solved ? " is-solved" : ""}`}>
      <p className="inbox-line-from">
        From {item.from.displayName}
        <span className="muted"> · {label}</span>
      </p>
      {solved ? (
        <blockquote className="inbox-line-pair">
          <p className="prompt-current">{promptText}</p>
          <p className="inbox-nextline">{nextText}</p>
        </blockquote>
      ) : !question ? (
        <p className="muted">This line isn’t playable in the current catalog.</p>
      ) : (
        <>
          <blockquote className="prompt-text">
            {question.leadIn.map((line) => (
              <p key={line.lineIndex} className="prompt-lead-in">
                {line.text}
              </p>
            ))}
            <p className="prompt-current">{question.promptText}</p>
          </blockquote>
          <p className="prompt-label">What comes next?</p>
          <ul className="choice-list">
            {question.choices.map((choice) => {
              const isPicked = pickedIndex === choice.lineIndex;
              const showCorrect = feedback === "correct" && choice.lineIndex === question.correctLineIndex;
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
                    disabled={feedback === "correct"}
                    onClick={() => handleChoose(choice.lineIndex)}
                  >
                    {choice.text}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
