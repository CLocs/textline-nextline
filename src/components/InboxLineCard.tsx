import { useEffect, useMemo, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { catalogLabel } from "../lib/content/libraryGroups";
import { getLine } from "../lib/content/lines";
import { getNextPlayableLine } from "../lib/content/playable";
import { leadInForPrompt } from "../lib/game/promptContext";
import { buildMcq } from "../lib/game/mcq";
import { isInboxItemSolved, markInboxItemSolvedEverywhere } from "../lib/inbox/solved";
import type { InboxItem } from "../lib/inbox/api";
import type { CatalogEntry } from "../types/content";
import type { ChatReaction } from "../lib/chats/api";
import { ChatQuoteActions } from "./ChatQuoteActions";
import { ChatReactions } from "./ChatReactions";

const CORRECT_HOLD_MS = 900;

type Props = {
  item: InboxItem;
  entries: CatalogEntry[];
  /** Star + reshare toolbar (Chats). */
  showQuoteActions?: boolean;
  shareId?: string;
  reactions?: ChatReaction[];
  peerUserId?: string;
  groupId?: string;
  onReactions?: (reactions: ChatReaction[]) => void;
};

export function InboxLineCard({
  item,
  entries,
  showQuoteActions = false,
  shareId,
  reactions = [],
  peerUserId,
  groupId,
  onReactions,
}: Props) {
  const title = getTitle(item.titleId);
  const entry = entries.find((row) => row.id === item.titleId);
  const label = entry ? catalogLabel(entry) : (title?.title ?? item.titleId);
  const question = useMemo(() => {
    const loaded = getTitle(item.titleId);
    return loaded ? buildMcq(loaded, item.lineIndex) : null;
  }, [item.titleId, item.lineIndex]);
  const [solved, setSolved] = useState(() => isInboxItemSolved(item.id));
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const promptText = title ? (getLine(title, item.lineIndex)?.text ?? "") : "";
  const leadIn = useMemo(
    () => (title ? leadInForPrompt(title, item.lineIndex) : []),
    [title, item.lineIndex],
  );
  const nextText = title ? (getNextPlayableLine(title, item.lineIndex)?.text ?? "") : "";

  useEffect(() => {
    if (feedback !== "correct") return;
    const timer = window.setTimeout(() => {
      void markInboxItemSolvedEverywhere(item.id);
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
      <div className={showQuoteActions ? "chat-quote-header" : undefined}>
        <p className="inbox-line-from">
          From {item.from.displayName}
          <span className="muted"> · {label}</span>
        </p>
        {showQuoteActions ? (
          <ChatQuoteActions titleId={item.titleId} lineIndex={item.lineIndex} lineText={promptText} />
        ) : null}
      </div>
      {solved ? (
        <blockquote className="inbox-line-pair">
          {leadIn.map((line) => (
            <p key={line.lineIndex} className="prompt-lead-in">
              {line.text}
            </p>
          ))}
          <p className="prompt-current">{promptText}</p>
          {nextText ? <p className="inbox-nextline">{nextText}</p> : null}
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
                isPicked && feedback === "wrong" ? "is-missed" : "",
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
                    {feedback === "wrong" && isPicked && (
                      <span className="choice-miss-tag">Missed</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {showQuoteActions && shareId && onReactions ? (
        <ChatReactions
          targetKind="quote"
          targetId={shareId}
          reactions={reactions}
          peerUserId={peerUserId}
          groupId={groupId}
          onReactions={onReactions}
        />
      ) : null}
    </article>
  );
}
