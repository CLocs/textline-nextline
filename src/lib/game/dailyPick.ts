export type DailySlot = "global" | "starred";

export type DailyLine = {
  titleId: string;
  lineIndex: number;
  count: number;
  loved: boolean;
  /** Which of the day's three cards this line fills. Set when the day is picked. */
  slot?: DailySlot;
};

export const DAILY_SIZE = 3;
/** Do not repeat a textline on any of the previous 7 calendar days. */
export const DAILY_LOOKBACK_DAYS = 7;
const DAILY_EPOCH = "2026-09-01";
const TOP_STARRED_SLICE = 24;

export function lineKey(line: { titleId: string; lineIndex: number }): string {
  return `${line.titleId}:${line.lineIndex}`;
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Local calendar day, YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function rngFor(date: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

function takeOne(list: DailyLine[], taken: Set<string>, rng: () => number): DailyLine | null {
  const open = list.filter((line) => !taken.has(lineKey(line)));
  if (open.length === 0) return null;
  const pick = open[Math.floor(rng() * open.length)];
  if (!pick) return null;
  taken.add(lineKey(pick));
  return pick;
}

function place(line: DailyLine, slot: DailySlot): DailyLine {
  return { ...line, slot };
}

function uniqueLines(pool: DailyLine[], excluded: Set<string>): DailyLine[] {
  const seen = new Set<string>();
  return pool.filter((line) => {
    const key = lineKey(line);
    if (seen.has(key) || excluded.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byStarCount(a: DailyLine, b: DailyLine): number {
  return b.count - a.count || a.titleId.localeCompare(b.titleId) || a.lineIndex - b.lineIndex;
}

function keysInWindow(recent: { date: string; keys: string[] }[], cursor: string): Set<string> {
  const excluded = new Set<string>();
  const earliest = addDays(cursor, -DAILY_LOOKBACK_DAYS);
  for (const row of recent) {
    if (row.date >= earliest && row.date < cursor) {
      for (const key of row.keys) excluded.add(key);
    }
  }
  return excluded;
}

/** Shared loved line. Same for everyone; personal stars do not change it. */
export function pickGlobalLine(
  date: string,
  globalPool: DailyLine[],
  excluded: Set<string>,
): DailyLine | null {
  const open = uniqueLines(globalPool, excluded);
  const loved = open.filter((line) => line.loved);
  const lovedPick = takeOne(loved, new Set(excluded), rngFor(`${date}:tlod`));
  if (lovedPick) return place(lovedPick, "global");

  const starred = [...open].sort(byStarCount);
  const top = starred.slice(0, TOP_STARRED_SLICE);
  const fallback = takeOne(top.length > 0 ? top : starred, new Set(excluded), rngFor(`${date}:tlod`));
  return fallback ? place(fallback, "global") : null;
}

/** Two starred lines. Personal stars fill first; the global pool fills whatever is left. */
export function pickStarredCards(
  date: string,
  personalPool: DailyLine[],
  globalPool: DailyLine[],
  excluded: Set<string>,
): DailyLine[] {
  const taken = new Set(excluded);
  const rng = rngFor(`${date}:starred`);
  const personal = uniqueLines(personalPool, taken);
  const globalStarred = [...uniqueLines(globalPool, taken)].sort(byStarCount);
  const top = globalStarred.slice(0, TOP_STARRED_SLICE);
  const cards: DailyLine[] = [];

  while (cards.length < DAILY_SIZE - 1) {
    const next = takeOne(personal, taken, rng);
    if (!next) break;
    cards.push(place(next, "starred"));
  }
  const fillFrom = top.length > 0 ? top : globalStarred;
  while (cards.length < DAILY_SIZE - 1) {
    const next = takeOne(fillFrom, taken, rng);
    if (!next) break;
    cards.push(place(next, "starred"));
  }
  return cards;
}

/**
 * Line of the day, then two starred lines.
 * The line of the day is one loved line from the global pool.
 * The starred lines use the personal pool first.
 */
export function pickDailyCards(
  date: string,
  globalPool: DailyLine[],
  personalPool: DailyLine[] = [],
  excludedGlobal: Set<string> = new Set(),
  excludedPersonal: Set<string> = excludedGlobal,
): DailyLine[] {
  const global = pickGlobalLine(date, globalPool, excludedGlobal);
  const excluded = new Set(excludedPersonal);
  if (global) excluded.add(lineKey(global));
  const starred = pickStarredCards(date, personalPool, globalPool, excluded);
  return global ? [global, ...starred] : starred;
}

/** Today's three cards. The line of the day skips its own previous 7 days; personal cards skip theirs. */
export function dailyCardsOn(
  date: string,
  globalPool: DailyLine[],
  personalPool: DailyLine[] = [],
): DailyLine[] {
  let cursor = date < DAILY_EPOCH ? date : DAILY_EPOCH;
  const globalRecent: { date: string; keys: string[] }[] = [];
  const personalRecent: { date: string; keys: string[] }[] = [];
  let last: DailyLine[] = [];
  while (cursor <= date) {
    const excludedGlobal = keysInWindow(globalRecent, cursor);
    const excludedPersonal = keysInWindow(personalRecent, cursor);
    for (const key of excludedGlobal) excludedPersonal.add(key);
    last = pickDailyCards(cursor, globalPool, personalPool, excludedGlobal, excludedPersonal);
    const globalCard = last.find((card) => card.slot === "global");
    globalRecent.push({ date: cursor, keys: globalCard ? [lineKey(globalCard)] : [] });
    personalRecent.push({
      date: cursor,
      keys: last.filter((card) => card.slot !== "global").map(lineKey),
    });
    cursor = addDays(cursor, 1);
  }
  return last;
}

function drawInstant(
  personalPool: DailyLine[],
  globalPool: DailyLine[],
  excluded: Set<string>,
  rng: () => number,
): DailyLine[] {
  const taken = new Set(excluded);
  const cards: DailyLine[] = [];
  const personal = uniqueLines(personalPool, taken);
  while (cards.length < DAILY_SIZE) {
    const next = takeOne(personal, taken, rng);
    if (!next) break;
    cards.push(place(next, "starred"));
  }
  const global = uniqueLines(globalPool, taken);
  while (cards.length < DAILY_SIZE) {
    const next = takeOne(global, taken, rng);
    if (!next) break;
    cards.push(place(next, "starred"));
  }
  return cards;
}

/** Three framed quotes for right now. Personal stars first. Not the daily. */
export function pickInstantCards(
  personalPool: DailyLine[],
  globalPool: DailyLine[],
  avoid: Set<string> = new Set(),
  rng: () => number = Math.random,
): DailyLine[] {
  const preferred = drawInstant(personalPool, globalPool, avoid, rng);
  if (preferred.length > 0) return preferred;
  return drawInstant(personalPool, globalPool, new Set(), rng);
}

/** One starred quote for this Home visit. Personal stars first, then the framed pool. */
export function pickVisitQuote(
  personalPool: DailyLine[],
  globalPool: DailyLine[],
  rng: () => number = Math.random,
): DailyLine | null {
  const personal = takeOne(uniqueLines(personalPool, new Set()), new Set(), rng);
  if (personal) return personal;
  return takeOne(uniqueLines(globalPool, new Set()), new Set(), rng);
}

export function rotateCards<T>(cards: T[], startIndex: number): T[] {
  if (cards.length === 0) return [];
  const start = ((startIndex % cards.length) + cards.length) % cards.length;
  return [...cards.slice(start), ...cards.slice(0, start)];
}
