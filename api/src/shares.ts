import { createId, createShareId } from "./crypto.js";
import type { User } from "./auth.js";

export type MiniShare = {
  id: string;
  ownerUserId: string;
  titleId: string;
  createdAt: string;
  frozen: boolean;
};

export type ShareQueue = {
  titleId: string;
  lineIndices: number[];
  frozen: boolean;
};

export type ShareMeta = {
  shareId: string;
  titleId: string;
  ownerDisplayName: string;
  ownerEmail: string;
  starCount: number;
  createdAt: string;
};

export type SharedRunRow = {
  playerUserId: string;
  displayName: string;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  completedAt: string;
};

export async function createShare(
  db: D1Database,
  owner: User,
  titleId: string,
): Promise<MiniShare> {
  const id = createShareId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO mini_shares (id, owner_user_id, title_id, created_at, revoked_at, line_indices)
       VALUES (?, ?, ?, ?, NULL, NULL)`,
    )
    .bind(id, owner.id, titleId, createdAt)
    .run();

  return { id, ownerUserId: owner.id, titleId, createdAt, frozen: false };
}

export async function createFrozenShare(
  db: D1Database,
  owner: User,
  titleId: string,
  lineIndices: number[],
): Promise<MiniShare> {
  const id = createShareId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO mini_shares (id, owner_user_id, title_id, created_at, revoked_at, line_indices)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .bind(id, owner.id, titleId, createdAt, JSON.stringify(lineIndices))
    .run();

  return { id, ownerUserId: owner.id, titleId, createdAt, frozen: true };
}

export async function getShareMeta(
  db: D1Database,
  shareId: string,
): Promise<ShareMeta | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.title_id, s.created_at, s.revoked_at,
              u.email, u.display_name,
              (SELECT COUNT(*) FROM stars st
               WHERE st.player_id = s.owner_user_id AND st.title_id = s.title_id) AS star_count
       FROM mini_shares s
       JOIN users u ON u.id = s.owner_user_id
       WHERE s.id = ?`,
    )
    .bind(shareId)
    .first<{
      id: string;
      title_id: string;
      created_at: string;
      revoked_at: string | null;
      email: string;
      display_name: string | null;
      star_count: number;
    }>();

  if (!row || row.revoked_at) return null;

  return {
    shareId: row.id,
    titleId: row.title_id,
    ownerDisplayName: row.display_name ?? row.email.split("@")[0] ?? "player",
    ownerEmail: row.email,
    starCount: Number(row.star_count) || 0,
    createdAt: row.created_at,
  };
}

export async function getShareQueue(
  db: D1Database,
  shareId: string,
): Promise<ShareQueue | null> {
  const share = await db
    .prepare(
      `SELECT title_id, owner_user_id, revoked_at, line_indices FROM mini_shares WHERE id = ?`,
    )
    .bind(shareId)
    .first<{
      title_id: string;
      owner_user_id: string;
      revoked_at: string | null;
      line_indices: string | null;
    }>();

  if (!share || share.revoked_at) return null;

  if (share.line_indices) {
    try {
      const parsed = JSON.parse(share.line_indices) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number" && Number.isInteger(item))) {
        return {
          titleId: share.title_id,
          lineIndices: parsed,
          frozen: true,
        };
      }
    } catch {
      return null;
    }
  }

  const stars = await db
    .prepare(
      `SELECT line_index FROM stars
       WHERE player_id = ? AND title_id = ?
       ORDER BY line_index ASC`,
    )
    .bind(share.owner_user_id, share.title_id)
    .all<{ line_index: number }>();

  return {
    titleId: share.title_id,
    lineIndices: (stars.results ?? []).map((row) => row.line_index),
    frozen: false,
  };
}

export async function upsertSharedRun(
  db: D1Database,
  shareId: string,
  player: User,
  scores: { correctCount: number; wrongCount: number; skipCount: number },
): Promise<{ ok: true } | { error: string; status: number }> {
  const share = await db
    .prepare(`SELECT id, revoked_at FROM mini_shares WHERE id = ?`)
    .bind(shareId)
    .first<{ id: string; revoked_at: string | null }>();

  if (!share || share.revoked_at) {
    return { error: "Share not found", status: 404 };
  }

  const completedAt = new Date().toISOString();
  const id = createId();

  await db
    .prepare(
      `INSERT INTO shared_runs
         (id, share_id, player_user_id, correct_count, wrong_count, skip_count, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(share_id, player_user_id) DO UPDATE SET
         correct_count = excluded.correct_count,
         wrong_count = excluded.wrong_count,
         skip_count = excluded.skip_count,
         completed_at = excluded.completed_at,
         id = excluded.id`,
    )
    .bind(
      id,
      shareId,
      player.id,
      scores.correctCount,
      scores.wrongCount,
      scores.skipCount,
      completedAt,
    )
    .run();

  return { ok: true };
}

export async function listSharedRuns(
  db: D1Database,
  shareId: string,
): Promise<SharedRunRow[]> {
  const result = await db
    .prepare(
      `SELECT r.player_user_id, r.correct_count, r.wrong_count, r.skip_count, r.completed_at,
              u.email, u.display_name
       FROM shared_runs r
       JOIN users u ON u.id = r.player_user_id
       WHERE r.share_id = ?
       ORDER BY r.correct_count DESC, r.wrong_count ASC, r.completed_at ASC`,
    )
    .bind(shareId)
    .all<{
      player_user_id: string;
      correct_count: number;
      wrong_count: number;
      skip_count: number;
      completed_at: string;
      email: string;
      display_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    playerUserId: row.player_user_id,
    displayName: row.display_name ?? row.email.split("@")[0] ?? "player",
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    skipCount: row.skip_count,
    completedAt: row.completed_at,
  }));
}
