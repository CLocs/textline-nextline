import { addDays } from "./dailyPick.js";

export type StreakState = {
  lastCompletedOn: string | null;
  streak: number;
};

export const EMPTY_STREAK: StreakState = { lastCompletedOn: null, streak: 0 };

/** Completing the same day twice does not add a day. A gap resets to 1. */
export function nextStreak(state: StreakState, completedOn: string): StreakState {
  if (state.lastCompletedOn === completedOn) return state;
  if (state.lastCompletedOn && addDays(state.lastCompletedOn, 1) === completedOn) {
    return { lastCompletedOn: completedOn, streak: state.streak + 1 };
  }
  return { lastCompletedOn: completedOn, streak: 1 };
}

export function preferStreak(a: StreakState, b: StreakState): StreakState {
  if (!a.lastCompletedOn) return b;
  if (!b.lastCompletedOn) return a;
  if (a.lastCompletedOn !== b.lastCompletedOn) {
    return a.lastCompletedOn > b.lastCompletedOn ? a : b;
  }
  return a.streak >= b.streak ? a : b;
}
