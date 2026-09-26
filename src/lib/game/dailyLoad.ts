import { getTitle } from "../content/browser.js";
import { getLine } from "../content/lines.js";
import { getNextPlayableLine, isPlayableLine } from "../content/playable.js";
import { hasSceneFrame } from "../content/stillsLines.js";
import { fetchLovedStarsGlobal, fetchPopularStarsGlobal } from "../stars/api.js";
import { listStars } from "../stars/store.js";
import { dailyCardsOn, lineKey, todayIso, type DailyLine } from "./dailyPick.js";

function canPrompt(titleId: string, lineIndex: number): boolean {
  const title = getTitle(titleId);
  if (!title) return false;
  const prompt = getLine(title, lineIndex);
  if (!prompt || !isPlayableLine(prompt)) return false;
  return getNextPlayableLine(title, lineIndex) != null;
}

async function loadPool(): Promise<DailyLine[]> {
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
      const key = lineKey(star);
      const existing = map.get(key);
      if (existing) {
        existing.loved = existing.loved || star.loved;
        continue;
      }
      map.set(key, {
        titleId: star.titleId,
        lineIndex: star.lineIndex,
        count: 1,
        loved: star.loved,
      });
    }
  }

  return [...map.values()].filter(
    (line) => hasSceneFrame(line.titleId, line.lineIndex) && canPrompt(line.titleId, line.lineIndex),
  );
}

export async function loadTodaysCards(now = new Date()): Promise<DailyLine[]> {
  return dailyCardsOn(todayIso(now), await loadPool());
}
