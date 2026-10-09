import { useEffect, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { loadVisitLine } from "../lib/game/dailyLoad";
import type { DailyLine } from "../lib/game/dailyPick";
import { dismissVisitQuote, ensureVisitQuote } from "../lib/game/visitQuote";
import { PosterArt } from "./PosterArt";

type Props = {
  onAnswer: (line: DailyLine) => void;
};

/** One quote for this visit. Skip or a finished answer hides it until the next refresh. */
export function VisitQuote({ onAnswer }: Props) {
  const [line, setLine] = useState<DailyLine | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void ensureVisitQuote(loadVisitLine).then((next) => {
      if (!cancelled) setLine(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!line) return null;
  const title = getTitle(line.titleId);
  const prompt = title ? getLine(title, line.lineIndex) : undefined;
  if (!title || !prompt) return null;

  return (
    <article className="visit-quote">
      <div className="daily-fold-header">
        <h3 className="library-group-heading">A quote</h3>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            dismissVisitQuote();
            setLine(null);
          }}
        >
          Skip
        </button>
      </div>
      <PosterArt
        titleId={line.titleId}
        title={title.title}
        lineIndex={line.lineIndex}
        fallback="hide"
        className="play-poster visit-quote-still"
      />
      <blockquote className="prompt-text">
        <p className="prompt-current">{prompt.text}</p>
      </blockquote>
      <p className="muted visit-quote-title">{title.title}</p>
      <button type="button" className="button primary visit-quote-answer" onClick={() => onAnswer(line)}>
        Answer this
      </button>
    </article>
  );
}
