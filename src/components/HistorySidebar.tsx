import { useEffect, useRef } from "react";
import type { Title } from "../types/content";
import type { HistoryEntry, HistoryVia } from "../lib/game/session";
import { getLine } from "../lib/content/lines";
import { isStarred } from "../lib/stars/store";

type Props = {
  title: Title;
  history: HistoryEntry[];
  currentLineIndex: number;
};

function viaLabel(via: HistoryVia): string | null {
  switch (via) {
    case "skip":
      return "Skipped";
    case "incorrect":
      return "Missed";
    default:
      return null;
  }
}

export function HistorySidebar({ title, history, currentLineIndex }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [history.length, currentLineIndex]);

  return (
    <aside className="history-sidebar" aria-label="Transcript so far (read-only)">
      <div className="history-header">
        <h3>Transcript</h3>
        <p className="history-note">Read-only</p>
      </div>

      {history.length === 0 ? (
        <p className="muted history-empty">Lines will appear here as you play.</p>
      ) : (
        <ol ref={listRef} className="history-list">
          {history.map((entry, index) => {
            const line = getLine(title, entry.lineIndex);
            if (!line) return null;

            const isCurrent = entry.lineIndex === currentLineIndex && entry.via !== "incorrect";
            const tag = viaLabel(entry.via);
            const starred = isStarred(title.id, entry.lineIndex);

            return (
              <li
                key={`${entry.lineIndex}-${entry.via}-${index}`}
                className={`history-item${isCurrent ? " current" : ""}${starred ? " starred" : ""}`}
              >
                <div className="history-item-meta">
                  <span className="history-line-num">{index + 1}</span>
                  {starred && <span className="history-tag starred-tag">★ Starred</span>}
                  {tag && <span className="history-tag">{tag}</span>}
                  {isCurrent && <span className="history-tag current-tag">Now</span>}
                </div>
                <p className={`history-text via-${entry.via}`}>{line.text}</p>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
