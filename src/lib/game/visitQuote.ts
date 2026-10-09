import type { DailyLine } from "./dailyPick.js";

let quotePromise: Promise<DailyLine | null> | null = null;
let dismissed = false;

/** One quote for this page load. Refresh starts a new visit; leaving Home does not. */
export function ensureVisitQuote(load: () => Promise<DailyLine | null>): Promise<DailyLine | null> {
  if (dismissed) return Promise.resolve(null);
  if (!quotePromise) {
    quotePromise = load().then((line) => (dismissed ? null : line));
  }
  return quotePromise.then((line) => (dismissed ? null : line));
}

export function dismissVisitQuote(): void {
  dismissed = true;
}
