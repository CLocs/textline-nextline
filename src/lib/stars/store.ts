export type Star = {
  titleId: string;
  lineIndex: number;
  text: string;
  starredAt: string;
};

type StarStore = {
  stars: Star[];
};

const STORAGE_KEY = "textline-nextline-stars";

function readStore(): StarStore {
  if (typeof localStorage === "undefined") return { stars: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stars: [] };
    const parsed = JSON.parse(raw) as StarStore;
    return Array.isArray(parsed.stars) ? parsed : { stars: [] };
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

export function isStarred(titleId: string, lineIndex: number): boolean {
  return readStore().stars.some(
    (star) => star.titleId === titleId && star.lineIndex === lineIndex,
  );
}

/** Toggle star; returns true if now starred. */
export function toggleStar(titleId: string, lineIndex: number, text: string): boolean {
  const store = readStore();
  const key = starKey(titleId, lineIndex);
  const existing = store.stars.findIndex(
    (star) => starKey(star.titleId, star.lineIndex) === key,
  );

  if (existing !== -1) {
    store.stars.splice(existing, 1);
    writeStore(store);
    return false;
  }

  store.stars.push({
    titleId,
    lineIndex,
    text,
    starredAt: new Date().toISOString(),
  });
  writeStore(store);
  return true;
}
