/** Personal counts for later badges. Not shown in the app yet. */

export const DAILY_QUESTION_CAP = 3;

export type ScoreLine = {
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
};

export type RunLine = ScoreLine & {
  length: string;
};

export type PlayCounts = {
  minisPlayed: number;
  dailiesPlayed: number;
  perfectWeight: number;
  dmsCorrect: number;
};

type RunRow = {
  length: string;
  correct_count: number;
  wrong_count: number;
  skip_count: number;
  question_total: number;
};

type DailyRow = {
  correct_count: number;
  wrong_count: number;
  skip_count: number;
  question_total: number;
};

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Every question right, first try, with no miss and no skip. */
export function isPerfectLine(line: ScoreLine): boolean {
  return (
    line.questionTotal > 0 &&
    line.correctCount === line.questionTotal &&
    line.wrongCount === 0 &&
    line.skipCount === 0
  );
}

/**
 * Mini-games are length "mini" only. Full episodes stay out, and so does the weight
 * of a perfect full episode. Daily games are separate rows. A perfect adds its
 * correct answers, so a perfect 10 outweighs a perfect 3.
 */
export function playCounts(input: {
  runs: RunLine[];
  dailies: ScoreLine[];
  dmsCorrect: number;
}): PlayCounts {
  let minisPlayed = 0;
  let perfectWeight = 0;
  for (const run of input.runs) {
    if (run.length !== "mini") continue;
    minisPlayed += 1;
    if (isPerfectLine(run)) perfectWeight += run.correctCount;
  }
  for (const daily of input.dailies) {
    if (isPerfectLine(daily)) perfectWeight += daily.correctCount;
  }
  return {
    minisPlayed,
    dailiesPlayed: input.dailies.length,
    perfectWeight,
    dmsCorrect: input.dmsCorrect,
  };
}

/** Score fields omitted → null (streak only). Present but illegal → invalid. */
export function parseDailyScore(
  body: unknown,
): { ok: true; score: ScoreLine | null } | { ok: false } {
  if (!body || typeof body !== "object") return { ok: true, score: null };
  const record = body as Record<string, unknown>;
  const keys = ["correctCount", "wrongCount", "skipCount", "questionTotal"] as const;
  const present = keys.filter((key) => record[key] !== undefined);
  if (present.length === 0) return { ok: true, score: null };
  if (present.length !== keys.length) return { ok: false };
  const correctCount = record.correctCount;
  const wrongCount = record.wrongCount;
  const skipCount = record.skipCount;
  const questionTotal = record.questionTotal;
  if (
    !isNonNegInt(correctCount) ||
    !isNonNegInt(wrongCount) ||
    !isNonNegInt(skipCount) ||
    !isNonNegInt(questionTotal)
  ) {
    return { ok: false };
  }
  if (questionTotal > DAILY_QUESTION_CAP) return { ok: false };
  if (correctCount > questionTotal || skipCount > questionTotal) return { ok: false };
  if (correctCount + skipCount > questionTotal) return { ok: false };
  if (wrongCount > 99) return { ok: false };
  if (questionTotal === 0) return { ok: true, score: null };
  return {
    ok: true,
    score: { correctCount, wrongCount, skipCount, questionTotal },
  };
}

export async function recordDailyPlay(
  db: D1Database,
  userId: string,
  completedOn: string,
  score: ScoreLine,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_plays (
         user_id, completed_on, correct_count, wrong_count, skip_count, question_total, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, completed_on) DO NOTHING`,
    )
    .bind(
      userId,
      completedOn,
      score.correctCount,
      score.wrongCount,
      score.skipCount,
      score.questionTotal,
      new Date().toISOString(),
    )
    .run();
}

export async function fetchPlayCounts(db: D1Database, userId: string): Promise<PlayCounts> {
  const runs = await db
    .prepare(
      `SELECT length, correct_count, wrong_count, skip_count, question_total
       FROM runs WHERE user_id = ?`,
    )
    .bind(userId)
    .all<RunRow>();
  const dailies = await db
    .prepare(
      `SELECT correct_count, wrong_count, skip_count, question_total
       FROM daily_plays WHERE user_id = ?`,
    )
    .bind(userId)
    .all<DailyRow>();
  const dms = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM line_inbox
       WHERE recipient_user_id = ? AND guessed_right = 1`,
    )
    .bind(userId)
    .first<{ n: number }>();

  return playCounts({
    runs: (runs.results ?? []).map((row) => ({
      length: row.length,
      correctCount: Number(row.correct_count) || 0,
      wrongCount: Number(row.wrong_count) || 0,
      skipCount: Number(row.skip_count) || 0,
      questionTotal: Number(row.question_total) || 0,
    })),
    dailies: (dailies.results ?? []).map((row) => ({
      correctCount: Number(row.correct_count) || 0,
      wrongCount: Number(row.wrong_count) || 0,
      skipCount: Number(row.skip_count) || 0,
      questionTotal: Number(row.question_total) || 0,
    })),
    dmsCorrect: Number(dms?.n) || 0,
  });
}
