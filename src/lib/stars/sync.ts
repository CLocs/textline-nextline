import {
  fetchMyStars,
  fetchPopularStars,
  fetchPopularStarsGlobal,
  isStarApiEnabled,
  loveLine,
  starLine,
  unstarLine,
  type PopularStar,
} from "./api.js";
import {
  getLovedLineIndices,
  getStarredLineIndices,
  isLoved,
  isStarred,
  listStars,
  mergeRemoteStars,
  removeStarLocal,
  setLovedLocal,
  setStarLocal,
  type Star,
} from "./store.js";

export type { PopularStar };

export async function hydrateStarsForTitle(titleId: string): Promise<void> {
  if (!isStarApiEnabled()) return;
  const remote = await fetchMyStars(titleId);
  if (remote === null) return;
  mergeRemoteStars(titleId, remote);
}

export async function loadPopularStars(titleId: string, limit = 50): Promise<number[]> {
  if (!isStarApiEnabled()) return [];
  const popular = await fetchPopularStars(titleId, limit);
  if (!popular) return [];
  return popular.map((entry) => entry.lineIndex);
}

export async function loadPopularStarsGlobal(
  limit = 100,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isStarApiEnabled()) return map;
  const popular = await fetchPopularStarsGlobal(limit);
  if (!popular) return map;
  for (const entry of popular) {
    map.set(`${entry.titleId}:${entry.lineIndex}`, entry.count);
  }
  return map;
}

/** Toggle star locally first, then sync to API when available. */
export async function toggleStar(
  titleId: string,
  lineIndex: number,
  text: string,
): Promise<boolean> {
  const wasStarred = isStarred(titleId, lineIndex);
  const nowStarred = !wasStarred;

  if (nowStarred) {
    setStarLocal(titleId, lineIndex, text);
  } else {
    removeStarLocal(titleId, lineIndex);
  }

  if (!isStarApiEnabled()) return nowStarred;

  const synced = nowStarred
    ? await starLine(titleId, lineIndex)
    : await unstarLine(titleId, lineIndex);

  if (!synced) {
    if (nowStarred) {
      removeStarLocal(titleId, lineIndex);
    } else {
      setStarLocal(titleId, lineIndex, text);
    }
    return wasStarred;
  }

  return nowStarred;
}

/** Love requires an existing star. Caps at MAX_LOVED_PER_TITLE locally + on API. */
export async function toggleLove(titleId: string, lineIndex: number): Promise<boolean | null> {
  if (!isStarred(titleId, lineIndex)) return null;
  const wasLoved = isLoved(titleId, lineIndex);
  const nowLoved = !wasLoved;
  const ok = setLovedLocal(titleId, lineIndex, nowLoved);
  if (!ok) return wasLoved;

  if (!isStarApiEnabled()) return nowLoved;

  const synced = await loveLine(titleId, lineIndex, nowLoved);
  if (!synced) {
    setLovedLocal(titleId, lineIndex, wasLoved);
    return wasLoved;
  }

  return nowLoved;
}

export {
  getLovedLineIndices,
  getStarredLineIndices,
  isLoved,
  isStarred,
  listStars,
  type Star,
};

export function getStarsForTitle(titleId: string): Star[] {
  return listStars().filter((star) => star.titleId === titleId);
}
