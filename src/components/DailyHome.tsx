import { useEffect, useState } from "react";
import { getTitle } from "../lib/content/browser";
import { getLine } from "../lib/content/lines";
import { lineKey, todayIso, type DailyLine } from "../lib/game/dailyPick";
import { loadTodaysCards } from "../lib/game/dailyLoad";
import { loadStreak, readLocalStreak } from "../lib/game/dailyClient";
import { PosterArt } from "./PosterArt";

type Props = {
  onPlay: (startIndex: number) => void;
};

function snippet(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
}

export function DailyHome({ onPlay }: Props) {
  const [streak, setStreak] = useState(readLocalStreak);
  const [cards, setCards] = useState<DailyLine[] | null>(null);
  const doneToday = streak.lastCompletedOn === todayIso();
  const badge =
    streak.streak > 0
      ? `${streak.streak}-day streak${doneToday ? " · done today" : ""}`
      : "Start a streak";

  useEffect(() => {
    let cancelled = false;
    void loadStreak().then((next) => {
      if (!cancelled) setStreak(next);
    });
    void loadTodaysCards().then((next) => {
      if (!cancelled) setCards(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="home-top">
        <div className="section-header">
          <h2>Home</h2>
          <p className="muted">Your games, then what everyone else is playing.</p>
        </div>
        <p className="streak-badge" aria-label={badge}>
          {badge}
        </p>
      </div>

      <section className="panel home-section">
        <h3 className="library-group-heading">Today&apos;s Daily Quotes</h3>
        {cards === null ? (
          <p className="muted">Loading today’s three…</p>
        ) : cards.length === 0 ? (
          <p className="muted">No framed quotes lined up for today.</p>
        ) : (
          <ul className="title-list">
            {cards.map((card, index) => {
              const title = getTitle(card.titleId);
              const prompt = title ? getLine(title, card.lineIndex) : undefined;
              return (
                <li key={lineKey(card)}>
                  <button type="button" className="title-card daily-card" onClick={() => onPlay(index)}>
                    <PosterArt
                      titleId={card.titleId}
                      title={title?.title ?? "Today"}
                      lineIndex={card.lineIndex}
                      fallback="hide"
                      className="title-card-still"
                    />
                    <span className="title-card-copy">
                      <span className="title-card-name">
                        {prompt ? snippet(prompt.text) : `Question ${index + 1}`}
                      </span>
                      <span className="muted">{title?.title ?? `Question ${index + 1}`}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
