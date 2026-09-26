function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DailyStreakRow = {
  lastCompletedOn: string | null;
  streak: number;
};

export function isPlausibleCompletionDate(date: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (parsed.toISOString().slice(0, 10) !== date) return false;
  const utcToday = now.toISOString().slice(0, 10);
  return date === utcToday || date === addDays(utcToday, -1) || date === addDays(utcToday, 1);
}

export function nextDailyStreak(current: DailyStreakRow, completedOn: string): DailyStreakRow {
  if (current.lastCompletedOn === completedOn) return current;
  if (current.lastCompletedOn && addDays(current.lastCompletedOn, 1) === completedOn) {
    return { lastCompletedOn: completedOn, streak: current.streak + 1 };
  }
  return { lastCompletedOn: completedOn, streak: 1 };
}

export async function fetchDailyStreak(db: D1Database, userId: string): Promise<DailyStreakRow> {
  const row = await db
    .prepare(`SELECT last_completed_on, streak FROM daily_streaks WHERE user_id = ?`)
    .bind(userId)
    .first<{ last_completed_on: string; streak: number }>();
  if (!row) return { lastCompletedOn: null, streak: 0 };
  return { lastCompletedOn: row.last_completed_on, streak: row.streak };
}

export async function recordDailyStreak(
  db: D1Database,
  userId: string,
  completedOn: string,
): Promise<DailyStreakRow> {
  const current = await fetchDailyStreak(db, userId);
  const next = nextDailyStreak(current, completedOn);
  await db
    .prepare(
      `INSERT INTO daily_streaks (user_id, last_completed_on, streak, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_completed_on = excluded.last_completed_on,
         streak = excluded.streak,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, next.lastCompletedOn, next.streak, new Date().toISOString())
    .run();
  return next;
}
