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

export function setStarLocal(titleId: string, lineIndex: number, text: string): void {
  const store = readStore();
  const key = starKey(titleId, lineIndex);
  if (store.stars.some((star) => starKey(star.titleId, star.lineIndex) === key)) return;

  store.stars.push({
    titleId,
    lineIndex,
    text,
    starredAt: new Date().toISOString(),
  });
  writeStore(store);
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

/** Merge server indices into local cache without removing local-only stars. */
export function mergeRemoteStarIndices(titleId: string, lineIndices: number[]): void {
  const store = readStore();
  const existing = new Set(
    store.stars
      .filter((star) => star.titleId === titleId)
      .map((star) => star.lineIndex),
  );

  for (const lineIndex of lineIndices) {
    if (existing.has(lineIndex)) continue;
    store.stars.push({
      titleId,
      lineIndex,
      text: "",
      starredAt: new Date().toISOString(),
    });
    existing.add(lineIndex);
  }

  writeStore(store);
}
