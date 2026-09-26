export type DailyLine = {
  titleId: string;
  lineIndex: number;
  count: number;
  loved: boolean;
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

/** One loved line, then two from the top-starred slice. Loved slot falls back to top starred. */
export function pickDailyCards(date: string, pool: DailyLine[], excluded: Set<string>): DailyLine[] {
  const rng = rngFor(date);
  const seen = new Set<string>();
  const unique = pool.filter((line) => {
    const key = lineKey(line);
    if (seen.has(key) || excluded.has(key)) return false;
    seen.add(key);
    return true;
  });
  const loved = unique.filter((line) => line.loved);
  const starred = [...unique].sort(
    (a, b) => b.count - a.count || a.titleId.localeCompare(b.titleId) || a.lineIndex - b.lineIndex,
  );
  const top = starred.slice(0, TOP_STARRED_SLICE);
  const taken = new Set(excluded);
  const cards: DailyLine[] = [];

  const lovedPick = takeOne(loved, taken, rng);
  if (lovedPick) cards.push(lovedPick);

  while (cards.length < DAILY_SIZE) {
    const next = takeOne(top.length > 0 ? top : starred, taken, rng);
    if (!next) break;
    cards.push(next);
  }
  return cards;
}

/** Today's three cards, skipping anything chosen on the previous 7 days. */
export function dailyCardsOn(date: string, pool: DailyLine[]): DailyLine[] {
  let cursor = date < DAILY_EPOCH ? date : DAILY_EPOCH;
  const recent: { date: string; keys: string[] }[] = [];
  let last: DailyLine[] = [];
  while (cursor <= date) {
    const excluded = new Set<string>();
    const earliest = addDays(cursor, -DAILY_LOOKBACK_DAYS);
    for (const row of recent) {
      if (row.date >= earliest && row.date < cursor) {
        for (const key of row.keys) excluded.add(key);
      }
    }
    last = pickDailyCards(cursor, pool, excluded);
    recent.push({ date: cursor, keys: last.map(lineKey) });
    cursor = addDays(cursor, 1);
  }
  return last;
}

export function rotateCards<T>(cards: T[], startIndex: number): T[] {
  if (cards.length === 0) return [];
  const start = ((startIndex % cards.length) + cards.length) % cards.length;
  return [...cards.slice(start), ...cards.slice(0, start)];
}
