import { createId } from "./crypto.js";
import type { User } from "./auth.js";
import { areFriends, isBlocked, isValidFriendUserId } from "./friends.js";
import { createFrozenShare } from "./shares.js";
import { isTitleId } from "./runs.js";

export const INBOX_CAP = 50;
export const SHARE_COOLDOWN_MS = 10_000;

export type LineShare = {
  shareId: string;
  url: string;
};

export type InboxItem = {
  id: string;
  shareId: string;
  titleId: string;
  lineIndex: number;
  from: { userId: string; displayName: string };
  createdAt: string;
};

type ActionError = { error: string; status: number };

function playUrl(appOrigin: string, shareId: string): string {
  return `${appOrigin.replace(/\/$/, "")}/#/play/${shareId}`;
}

function publicName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : "A player";
}

export function parsePromptLineIndex(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 50_000) return null;
  return raw;
}

async function lastShareAgeMs(db: D1Database, userId: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT created_at FROM mini_shares WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(userId)
    .first<{ created_at: string }>();
  if (!row) return null;
  return Date.now() - new Date(row.created_at).getTime();
}

async function assertCooldown(db: D1Database, userId: string): Promise<ActionError | null> {
  const age = await lastShareAgeMs(db, userId);
  if (age != null && age >= 0 && age < SHARE_COOLDOWN_MS) {
    return { error: "Please wait a moment before sending another line", status: 429 };
  }
  return null;
}

async function issueShare(
  db: D1Database,
  user: User,
  appOrigin: string,
  titleId: string,
  lineIndex: number,
): Promise<LineShare | ActionError> {
  if (!isTitleId(titleId)) return { error: "Invalid title", status: 400 };
  const cooled = await assertCooldown(db, user.id);
  if (cooled) return cooled;
  const share = await createFrozenShare(db, user, titleId, [lineIndex]);
  return { shareId: share.id, url: playUrl(appOrigin, share.id) };
}

export async function copyLineShare(
  db: D1Database,
  user: User,
  appOrigin: string,
  titleIdRaw: string,
  lineIndexRaw: unknown,
): Promise<LineShare | ActionError> {
  const titleId = titleIdRaw.trim();
  const lineIndex = parsePromptLineIndex(lineIndexRaw);
  if (!titleId || lineIndex == null) return { error: "Invalid line", status: 400 };
  return issueShare(db, user, appOrigin, titleId, lineIndex);
}

export async function sendLineToFriend(
  db: D1Database,
  user: User,
  appOrigin: string,
  titleIdRaw: string,
  lineIndexRaw: unknown,
  toUserIdRaw: string,
): Promise<LineShare | ActionError> {
  const titleId = titleIdRaw.trim();
  const lineIndex = parsePromptLineIndex(lineIndexRaw);
  const toUserId = toUserIdRaw.trim();
  if (!titleId || lineIndex == null) return { error: "Invalid line", status: 400 };
  if (!isValidFriendUserId(toUserId) || toUserId === user.id) {
    return { error: "Invalid recipient", status: 400 };
  }
  if (!(await areFriends(db, user.id, toUserId))) {
    return { error: "You can only send to friends", status: 403 };
  }
  if (await isBlocked(db, user.id, toUserId)) {
    return { error: "Can't send to this person", status: 403 };
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM line_inbox WHERE recipient_user_id = ?`)
    .bind(toUserId)
    .first<{ n: number }>();
  if (Number(countRow?.n ?? 0) >= INBOX_CAP) {
    return { error: "Their inbox is full", status: 400 };
  }

  const share = await issueShare(db, user, appOrigin, titleId, lineIndex);
  if ("error" in share) return share;

  await db
    .prepare(
      `INSERT OR IGNORE INTO line_inbox
         (id, share_id, sender_user_id, recipient_user_id, title_id, prompt_line_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(createId(), share.shareId, user.id, toUserId, titleId, lineIndex, new Date().toISOString())
    .run();

  return share;
}

export async function listInbox(db: D1Database, userId: string): Promise<InboxItem[]> {
  const result = await db
    .prepare(
      `SELECT i.id, i.share_id, i.title_id, i.prompt_line_index, i.created_at,
              u.id AS sender_id, u.display_name
       FROM line_inbox i
       JOIN users u ON u.id = i.sender_user_id
       WHERE i.recipient_user_id = ?
       ORDER BY i.created_at DESC
       LIMIT ?`,
    )
    .bind(userId, INBOX_CAP)
    .all<{
      id: string;
      share_id: string;
      title_id: string;
      prompt_line_index: number;
      created_at: string;
      sender_id: string;
      display_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    shareId: row.share_id,
    titleId: row.title_id,
    lineIndex: Number(row.prompt_line_index),
    from: { userId: row.sender_id, displayName: publicName(row.display_name) },
    createdAt: row.created_at,
  }));
}
