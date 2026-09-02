import {
  fetchMyStars,
  fetchPopularStars,
  isStarApiEnabled,
  starLine,
  unstarLine,
  type PopularStar,
} from "./api.js";
import {
  getStarredLineIndices,
  isStarred,
  listStars,
  mergeRemoteStarIndices,
  removeStarLocal,
  setStarLocal,
  type Star,
} from "./store.js";

export type { PopularStar };

export async function hydrateStarsForTitle(titleId: string): Promise<void> {
  if (!isStarApiEnabled()) return;
  const remote = await fetchMyStars(titleId);
  if (remote === null) return;
  mergeRemoteStarIndices(titleId, remote);
}

export async function loadPopularStars(titleId: string, limit = 50): Promise<number[]> {
  if (!isStarApiEnabled()) return [];
  const popular = await fetchPopularStars(titleId, limit);
  if (!popular) return [];
  return popular.map((entry) => entry.lineIndex);
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

export {
  getStarredLineIndices,
  isStarred,
  listStars,
  type Star,
};

export function getStarsForTitle(titleId: string): Star[] {
  return listStars().filter((star) => star.titleId === titleId);
}
