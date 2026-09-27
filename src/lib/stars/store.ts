export type StarOrigin = "mine" | "wikiquote";

export type Star = {
  titleId: string;
  lineIndex: number;
  text: string;
  starredAt: string;
  loved: boolean;
  /** mine = you starred it. wikiquote = imported for review. */
  origin: StarOrigin;
};

type StarStore = {
  stars: Star[];
};

const STORAGE_KEY = "textline-nextline-stars";

export const MAX_LOVED_PER_TITLE = 5;

function readStore(): StarStore {
  if (typeof localStorage === "undefined") return { stars: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stars: [] };
    const parsed = JSON.parse(raw) as StarStore;
    if (!Array.isArray(parsed.stars)) return { stars: [] };
    return {
      stars: parsed.stars.map((star) => ({
        ...star,
        loved: Boolean(star.loved),
        origin: star.origin === "wikiquote" ? "wikiquote" : "mine",
      })),
    };
  } catch {
    return { stars: [] };
  }
}

function writeStore(store: StarStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function starKey(titleId: string, lineIndex: number): string {
  return `${titleId}:${lineIndex}`;
}

export function listStars(): Star[] {
  return readStore().stars;
}

export function getStarsForTitle(titleId: string): Star[] {
  return listStars().filter((star) => star.titleId === titleId);
}

export function getStarredLineIndices(titleId: string): number[] {
  return getStarsForTitle(titleId).map((star) => star.lineIndex);
}

/** Stars you picked. Wikiquote imports stay out of the personal mini-game queue. */
export function getMineLineIndices(titleId: string): number[] {
  return getStarsForTitle(titleId)
    .filter((star) => star.origin !== "wikiquote")
    .map((star) => star.lineIndex);
}

export function getLovedLineIndices(titleId: string): number[] {
  return getStarsForTitle(titleId)
    .filter((star) => star.loved)
    .map((star) => star.lineIndex);
}

export function isStarred(titleId: string, lineIndex: number): boolean {
  return readStore().stars.some(
    (star) => star.titleId === titleId && star.lineIndex === lineIndex,
  );
}

export function isLoved(titleId: string, lineIndex: number): boolean {
  return readStore().stars.some(
    (star) => star.titleId === titleId && star.lineIndex === lineIndex && star.loved,
  );
}

export function setStarLocal(titleId: string, lineIndex: number, text: string): void {
  const store = readStore();
  const key = starKey(titleId, lineIndex);
  if (store.stars.some((star) => starKey(star.titleId, star.lineIndex) === key)) return;

  store.stars.push({
    titleId,
    lineIndex,
    text,
    starredAt: new Date().toISOString(),
    loved: false,
    origin: "mine",
  });
  writeStore(store);
}

export function setLovedLocal(titleId: string, lineIndex: number, loved: boolean): boolean {
  const store = readStore();
  const star = store.stars.find((s) => s.titleId === titleId && s.lineIndex === lineIndex);
  if (!star) return false;

  if (loved) {
    const lovedCount = store.stars.filter((s) => s.titleId === titleId && s.loved).length;
    if (!star.loved && lovedCount >= MAX_LOVED_PER_TITLE) return false;
  }

  star.loved = loved;
  if (loved) star.origin = "mine";
  writeStore(store);
  return true;
}

export function removeStarLocal(titleId: string, lineIndex: number): void {
  const store = readStore();
  const key = starKey(titleId, lineIndex);
  const existing = store.stars.findIndex(
    (star) => starKey(star.titleId, star.lineIndex) === key,
  );
  if (existing === -1) return;
  store.stars.splice(existing, 1);
  writeStore(store);
}

/** Merge server stars into local cache; sync loved flags for this title. */
export function mergeRemoteStars(
  titleId: string,
  remote: { lineIndex: number; loved: boolean; origin?: StarOrigin }[],
): void {
  const store = readStore();
  const remoteMap = new Map(remote.map((s) => [s.lineIndex, s]));
  const existing = new Set(
    store.stars.filter((star) => star.titleId === titleId).map((star) => star.lineIndex),
  );

  for (const star of store.stars) {
    if (star.titleId !== titleId) continue;
    const remoteStar = remoteMap.get(star.lineIndex);
    if (remoteStar) {
      star.loved = remoteStar.loved;
      star.origin = remoteStar.origin === "wikiquote" ? "wikiquote" : "mine";
    }
  }

  for (const entry of remote) {
    if (existing.has(entry.lineIndex)) continue;
    store.stars.push({
      titleId,
      lineIndex: entry.lineIndex,
      text: "",
      starredAt: new Date().toISOString(),
      loved: entry.loved,
      origin: entry.origin === "wikiquote" ? "wikiquote" : "mine",
    });
    existing.add(entry.lineIndex);
  }

  writeStore(store);
}

/** @deprecated use mergeRemoteStars */
export function mergeRemoteStarIndices(titleId: string, lineIndices: number[]): void {
  mergeRemoteStars(
    titleId,
    lineIndices.map((lineIndex) => ({ lineIndex, loved: false })),
  );
}
