/** Visible dots for a long run; mini-games already fit in this many. */
export const PROGRESS_WINDOW = 10;

export type SlotOutcome = "correct" | "skip" | "miss";
export type SlotState = "upcoming" | "current" | "correct" | "skip" | "miss";

export type ProgressWindow = {
  start: number;
  length: number;
  preceding: number;
  remaining: number;
};

export type VisibleProgressSlot = {
  state: SlotState;
  /** Sage connector to the next visible slot (streak). False = gap. */
  connectedToNext: boolean;
};

export type VisibleProgress = {
  preceding: number;
  remaining: number;
  slots: VisibleProgressSlot[];
};

/**
 * A 10-dot window around `currentIndex`, pinned at the ends.
 * `currentIndex === total` means every slot is done (no current).
 */
export function progressWindow(total: number, currentIndex: number): ProgressWindow {
  if (total <= 0) return { start: 0, length: 0, preceding: 0, remaining: 0 };
  const length = Math.min(PROGRESS_WINDOW, total);
  if (total <= PROGRESS_WINDOW) {
    return { start: 0, length: total, preceding: 0, remaining: 0 };
  }
  const focus = Math.min(Math.max(0, currentIndex), total - 1);
  const start = Math.min(
    Math.max(0, focus - Math.floor((length - 1) / 2)),
    total - length,
  );
  return {
    start,
    length,
    preceding: start,
    remaining: total - start - length,
  };
}

export function slotStateAt(
  index: number,
  currentIndex: number,
  total: number,
  outcomes: Array<SlotOutcome | null | undefined>,
  holdOutcome: SlotOutcome | null,
): SlotState {
  if (index < 0 || index >= total) return "upcoming";
  const recorded = outcomes[index] ?? null;
  if (currentIndex >= total) return recorded ?? "upcoming";
  if (index < currentIndex) return recorded ?? "upcoming";
  if (index > currentIndex) return "upcoming";
  if (recorded === "miss") return "miss";
  if (holdOutcome) return holdOutcome;
  if (recorded) return recorded;
  return "current";
}

/** True when two queue prompts are neighbors in the valid-prompt list. */
export function connectorsForQueue(
  queue: number[],
  validPromptIndices: number[],
): boolean[] {
  const validPos = new Map(validPromptIndices.map((index, pos) => [index, pos]));
  const links: boolean[] = [];
  for (let i = 0; i < queue.length - 1; i += 1) {
    const a = validPos.get(queue[i]!);
    const b = validPos.get(queue[i + 1]!);
    links.push(a !== undefined && b !== undefined && b === a + 1);
  }
  return links;
}

export function visibleProgress(
  total: number,
  currentIndex: number,
  outcomes: Array<SlotOutcome | null | undefined>,
  connected: boolean[],
  holdOutcome: SlotOutcome | null = null,
): VisibleProgress {
  const window = progressWindow(total, currentIndex);
  const slots: VisibleProgressSlot[] = [];
  for (let i = 0; i < window.length; i += 1) {
    const index = window.start + i;
    const isLastVisible = i === window.length - 1;
    slots.push({
      state: slotStateAt(index, currentIndex, total, outcomes, holdOutcome),
      connectedToNext: !isLastVisible && Boolean(connected[index]),
    });
  }
  return {
    preceding: window.preceding,
    remaining: window.remaining,
    slots,
  };
}

export function setSlotOutcome(
  outcomes: Array<SlotOutcome | null>,
  slot: number,
  outcome: SlotOutcome,
): Array<SlotOutcome | null> {
  if (slot < 0) return outcomes;
  const next = outcomes.slice();
  while (next.length <= slot) next.push(null);
  next[slot] = outcome;
  return next;
}
