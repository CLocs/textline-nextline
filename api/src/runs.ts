import type { User } from "./auth.js";
import { createFrozenShare, upsertSharedRun } from "./shares.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LENGTHS = new Set(["full", "mini"]);
const MODES = new Set(["fun", "teach", "medium", "hard"]);
const END_REASONS = new Set(["finished", "miss"]);
const THUMBS = new Set(["up", "down"]);

export type RunLength = "full" | "mini";
export type RunMode = "fun" | "teach" | "medium" | "hard";
export type EndReason = "finished" | "miss";
export type Thumb = "up" | "down";

export type RunBody = {
  id: string;
  titleId: string;
  length: RunLength;
  mode: RunMode;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
  endReason: EndReason;
  shareId: string | null;
  questionQueue: number[] | null;
};

export type StoredRun = {
  id: string;
  titleId: string;
  length: RunLength;
  mode: RunMode;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
  endReason: EndReason;
  shareId: string | null;
  questionQueue: number[] | null;
  completedAt: string;
  thumb: Thumb | null;
};

export type TitlePlayCount = {
  titleId: string;
  playCount: number;
};

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isRunId(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseQuestionQueue(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const indices: number[] = [];
  for (const item of raw) {
    if (!isNonNegInt(item)) return null;
    indices.push(item);
  }
  return indices;
}

export function decodeQuestionQueue(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    return parseQuestionQueue(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseRunBody(body: unknown): RunBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const id = record.id;
  const titleId = record.titleId;
  const length = record.length;
  const mode = record.mode;
  const endReason = record.endReason;
  if (typeof id !== "string" || !isRunId(id)) return null;
  if (typeof titleId !== "string" || !titleId.trim()) return null;
  if (typeof length !== "string" || !LENGTHS.has(length)) return null;
  if (typeof mode !== "string" || !MODES.has(mode)) return null;
  if (typeof endReason !== "string" || !END_REASONS.has(endReason)) return null;
  if (!isNonNegInt(record.correctCount)) return null;
  if (!isNonNegInt(record.wrongCount)) return null;
  if (!isNonNegInt(record.skipCount)) return null;
  if (!isNonNegInt(record.questionTotal)) return null;

  let shareId: string | null = null;
  if (record.shareId != null) {
    if (typeof record.shareId !== "string" || !record.shareId.trim() || record.shareId.length > 64) {
      return null;
    }
    shareId = record.shareId.trim();
  }

  let questionQueue: number[] | null = null;
  if (record.questionQueue != null) {
    if (Array.isArray(record.questionQueue) && record.questionQueue.length === 0) {
      questionQueue = null;
    } else {
      questionQueue = parseQuestionQueue(record.questionQueue);
      if (!questionQueue) return null;
    }
  }

  return {
    id,
    titleId: titleId.trim(),
    length: length as RunLength,
    mode: mode as RunMode,
    correctCount: record.correctCount,
    wrongCount: record.wrongCount,
    skipCount: record.skipCount,
    questionTotal: record.questionTotal,
    endReason: endReason as EndReason,
    shareId,
    questionQueue,
  };
}

export function parseThumb(body: unknown): Thumb | null {
  if (!body || typeof body !== "object") return null;
  const thumb = (body as Record<string, unknown>).thumb;
  if (typeof thumb !== "string" || !THUMBS.has(thumb)) return null;
  return thumb as Thumb;
}

export async function insertRun(
  db: D1Database,
  user: User,
  body: RunBody,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (
         id, user_id, title_id, length, mode,
         correct_count, wrong_count, skip_count, question_total,
         end_reason, share_id, question_queue, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      body.id,
      user.id,
      body.titleId,
      body.length,
      body.mode,
      body.correctCount,
      body.wrongCount,
      body.skipCount,
      body.questionTotal,
      body.endReason,
      body.shareId,
      body.questionQueue ? JSON.stringify(body.questionQueue) : null,
      new Date().toISOString(),
    )
    .run();
}

export async function rateRun(
  db: D1Database,
  user: User,
  runId: string,
  thumb: Thumb,
): Promise<{ ok: true } | { error: string; status: number }> {
  const row = await db
    .prepare(`SELECT id, user_id FROM runs WHERE id = ?`)
    .bind(runId)
    .first<{ id: string; user_id: string }>();

  if (!row || row.user_id !== user.id) {
    return { error: "Run not found", status: 404 };
  }

  await db
    .prepare(
      `INSERT INTO run_ratings (run_id, thumb, rated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         thumb = excluded.thumb,
         rated_at = excluded.rated_at`,
    )
    .bind(runId, thumb, new Date().toISOString())
    .run();

  return { ok: true };
}

export async function shareCompletedRun(
  db: D1Database,
  user: User,
  runId: string,
): Promise<{ shareId: string } | { error: string; status: number }> {
  const row = await db
    .prepare(
      `SELECT id, user_id, title_id, length, share_id, question_queue,
              correct_count, wrong_count, skip_count
       FROM runs WHERE id = ?`,
    )
    .bind(runId)
    .first<{
      id: string;
      user_id: string;
      title_id: string;
      length: string;
      share_id: string | null;
      question_queue: string | null;
      correct_count: number;
      wrong_count: number;
      skip_count: number;
    }>();

  if (!row || row.user_id !== user.id) {
    return { error: "Run not found", status: 404 };
  }
  if (row.length !== "mini") {
    return { error: "Only mini-games can be shared as an exact replay", status: 400 };
  }
  if (row.share_id) {
    return { shareId: row.share_id };
  }

  const queue = decodeQuestionQueue(row.question_queue);
  if (!queue) {
    return {
      error: "This run has no saved question list. Play a new mini-game to share it.",
      status: 400,
    };
  }

  const share = await createFrozenShare(db, user, row.title_id, queue);
  await db
    .prepare(`UPDATE runs SET share_id = ? WHERE id = ?`)
    .bind(share.id, runId)
    .run();
  await upsertSharedRun(db, share.id, user, {
    correctCount: Number(row.correct_count) || 0,
    wrongCount: Number(row.wrong_count) || 0,
    skipCount: Number(row.skip_count) || 0,
  });
  return { shareId: share.id };
}

export async function listMyRuns(
  db: D1Database,
  userId: string,
  limit = 100,
): Promise<StoredRun[]> {
  const capped = Math.min(Math.max(limit, 1), 200);
  const result = await db
    .prepare(
      `SELECT r.id, r.title_id, r.length, r.mode,
              r.correct_count, r.wrong_count, r.skip_count, r.question_total,
              r.end_reason, r.share_id, r.question_queue, r.completed_at, rt.thumb
       FROM runs r
       LEFT JOIN run_ratings rt ON rt.run_id = r.id
       WHERE r.user_id = ?
       ORDER BY r.completed_at DESC
       LIMIT ?`,
    )
    .bind(userId, capped)
    .all<{
      id: string;
      title_id: string;
      length: string;
      mode: string;
      correct_count: number;
      wrong_count: number;
      skip_count: number;
      question_total: number;
      end_reason: string;
      share_id: string | null;
      question_queue: string | null;
      completed_at: string;
      thumb: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    titleId: row.title_id,
    length: row.length as RunLength,
    mode: row.mode as RunMode,
    correctCount: Number(row.correct_count) || 0,
    wrongCount: Number(row.wrong_count) || 0,
    skipCount: Number(row.skip_count) || 0,
    questionTotal: Number(row.question_total) || 0,
    endReason: row.end_reason as EndReason,
    shareId: row.share_id,
    questionQueue: decodeQuestionQueue(row.question_queue),
    completedAt: row.completed_at,
    thumb: row.thumb === "up" || row.thumb === "down" ? row.thumb : null,
  }));
}

export async function fetchPlayedStats(
  db: D1Database,
  limit = 50,
): Promise<TitlePlayCount[]> {
  const capped = Math.min(Math.max(limit, 1), 100);
  const result = await db
    .prepare(
      `SELECT title_id, COUNT(*) AS play_count
       FROM runs
       GROUP BY title_id
       ORDER BY play_count DESC, title_id ASC
       LIMIT ?`,
    )
    .bind(capped)
    .all<{ title_id: string; play_count: number }>();

  return (result.results ?? []).map((row) => ({
    titleId: row.title_id,
    playCount: Number(row.play_count) || 0,
  }));
}

export type TitlePlayerStat = {
  displayName: string;
  gamesPlayed: number;
  linesGuessed: number;
  bestCorrect: number;
};

export type TitleStats = {
  playCount: number;
  players: TitlePlayerStat[];
};

const TITLE_ID_RE = /^[a-z0-9-]+$/i;

export function isTitleId(value: string): boolean {
  return TITLE_ID_RE.test(value) && value.length <= 120;
}

/** Per-title leaderboard: most games, plus each player's best correct-count. */
export async function fetchTitleStats(
  db: D1Database,
  titleId: string,
  limit = 8,
): Promise<TitleStats> {
  const capped = Math.min(Math.max(limit, 1), 20);
  const result = await db
    .prepare(
      `SELECT u.display_name, u.email,
              COUNT(*) AS games_played,
              SUM(r.correct_count) AS lines_guessed,
              MAX(r.correct_count) AS best_correct
       FROM runs r
       JOIN users u ON u.id = r.user_id
       WHERE r.title_id = ?
       GROUP BY u.id
       ORDER BY games_played DESC, best_correct DESC, u.display_name ASC
       LIMIT ?`,
    )
    .bind(titleId, capped)
    .all<{
      display_name: string | null;
      email: string;
      games_played: number;
      lines_guessed: number;
      best_correct: number;
    }>();

  const players: TitlePlayerStat[] = (result.results ?? []).map((row) => {
    const hint = row.display_name?.trim();
    const displayName =
      hint && hint.length > 0 ? hint : (row.email.split("@")[0] ?? "player");
    return {
      displayName,
      gamesPlayed: Number(row.games_played) || 0,
      linesGuessed: Number(row.lines_guessed) || 0,
      bestCorrect: Number(row.best_correct) || 0,
    };
  });

  return {
    playCount: players.reduce((sum, row) => sum + row.gamesPlayed, 0),
    players,
  };
}
