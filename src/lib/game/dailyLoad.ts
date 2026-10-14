import { getTitle } from "../content/browser.js";
import { getLine } from "../content/lines.js";
import { getNextPlayableLine, isPlayableLine } from "../content/playable.js";
import { hasSceneFrame } from "../content/stillsLines.js";
import { fetchPopularQuotesGlobal } from "../quotes/api.js";
import { hydrateAllQuotes, listQuotes } from "../quotes/sync.js";
import { fetchLovedStarsGlobal, fetchPopularStarsGlobal } from "../stars/api.js";
import { listStars } from "../stars/store.js";
import {
  dailyCardsOn,
  lineKey,
  pickInstantCards,
  pickVisitQuote,
  standaloneQuoteOn,
  todayIso,
  type DailyLine,
} from "./dailyPick.js";

function canPrompt(titleId: string, lineIndex: number): boolean {
  const title = getTitle(titleId);
  if (!title) return false;
  const prompt = getLine(title, lineIndex);
  if (!prompt || !isPlayableLine(prompt)) return false;
  return getNextPlayableLine(title, lineIndex) != null;
}

function framed(line: DailyLine): boolean {
  return hasSceneFrame(line.titleId, line.lineIndex) && canPrompt(line.titleId, line.lineIndex);
}

/** Crowd loved + popular lines. The line of the day is chosen from here. */
async function loadGlobalPool(): Promise<DailyLine[]> {
  const popular = await fetchPopularStarsGlobal(400);
  const loved = await fetchLovedStarsGlobal(200);
  const map = new Map<string, DailyLine>();

  if (popular) {
    for (const row of popular) {
      map.set(lineKey(row), {
        titleId: row.titleId,
        lineIndex: row.lineIndex,
        count: row.count,
        loved: false,
      });
    }
  }
  if (loved) {
    for (const row of loved) {
      const key = lineKey(row);
      const existing = map.get(key);
      if (existing) existing.loved = true;
      else {
        map.set(key, {
          titleId: row.titleId,
          lineIndex: row.lineIndex,
          count: 1,
          loved: true,
        });
      }
    }
  }

  if (!popular && !loved) {
    for (const star of listStars()) {
      map.set(lineKey(star), {
        titleId: star.titleId,
        lineIndex: star.lineIndex,
        count: 1,
        loved: star.loved,
      });
    }
  }

  return [...map.values()].filter(framed);
}

/** This player's stars. The two starred cards use these before the global pool. */
function loadPersonalPool(): DailyLine[] {
  return listStars()
    .map((star) => ({
      titleId: star.titleId,
      lineIndex: star.lineIndex,
      count: 1,
      loved: star.loved,
    }))
    .filter(framed);
}

export async function loadTodaysCards(now = new Date()): Promise<DailyLine[]> {
  return dailyCardsOn(todayIso(now), await loadGlobalPool(), loadPersonalPool());
}

/** Three quotes that are not today's daily. Personal framed stars fill first. */
export async function loadInstantCards(now = new Date()): Promise<DailyLine[]> {
  const personal = loadPersonalPool();
  const global = await loadGlobalPool();
  const today = new Set(dailyCardsOn(todayIso(now), global, personal).map(lineKey));
  return pickInstantCards(personal, global, today);
}

/** The quote waiting on Home. Personal framed stars, then the shared framed pool. */
export async function loadVisitLine(): Promise<DailyLine | null> {
  return pickVisitQuote(loadPersonalPool(), await loadGlobalPool());
}

function framedQuote(line: DailyLine): boolean {
  if (!hasSceneFrame(line.titleId, line.lineIndex)) return false;
  const title = getTitle(line.titleId);
  const text = title ? getLine(title, line.lineIndex)?.text.trim() : "";
  return Boolean(text);
}

/** Today's no-guess quote. Personal marks first, then the most-marked crowd quotes. */
export async function loadTodaysQuote(now = new Date()): Promise<DailyLine | null> {
  await hydrateAllQuotes();
  const personal = listQuotes()
    .map((quote) => ({
      titleId: quote.titleId,
      lineIndex: quote.lineIndex,
      count: 1,
      loved: false,
    }))
    .filter(framedQuote);
  const popular = await fetchPopularQuotesGlobal(400);
  const global = (popular ?? [])
    .map((quote) => ({
      titleId: quote.titleId,
      lineIndex: quote.lineIndex,
      count: quote.count,
      loved: false,
    }))
    .filter(framedQuote);
  return standaloneQuoteOn(todayIso(now), global, personal);
}
