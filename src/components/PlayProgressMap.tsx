import { visibleProgress, type SlotOutcome } from "../lib/game/progressMap";

type Props = {
  total: number;
  currentIndex: number;
  outcomes: Array<SlotOutcome | null | undefined>;
  connected: boolean[];
  label: string;
  holdOutcome?: SlotOutcome | null;
};

export function PlayProgressMap({
  total,
  currentIndex,
  outcomes,
  connected,
  label,
  holdOutcome = null,
}: Props) {
  if (total < 1) return null;
  const view = visibleProgress(total, currentIndex, outcomes, connected, holdOutcome);
  const now = Math.min(Math.max(currentIndex + 1, 1), total);

  return (
    <div
      className="play-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={now}
    >
      {view.preceding > 0 ? (
        <>
          <span className="play-progress-count">{view.preceding}</span>
          <span className="play-progress-ellipsis" aria-hidden="true">
            …
          </span>
        </>
      ) : null}
      <ol className="play-progress-track" aria-hidden="true">
        {view.slots.map((slot, i) => (
          <li key={i} className="play-progress-slot">
            <span className={`play-progress-dot is-${slot.state}`} />
            {i < view.slots.length - 1 ? (
              <span
                className={`play-progress-link${slot.connectedToNext ? " is-streak" : " is-gap"}`}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {view.remaining > 0 ? (
        <>
          <span className="play-progress-ellipsis" aria-hidden="true">
            …
          </span>
          <span className="play-progress-count">{view.remaining}</span>
        </>
      ) : null}
    </div>
  );
}
