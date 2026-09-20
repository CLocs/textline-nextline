import { createId } from "./crypto.js";
import type { User } from "./auth.js";
import { areFriends, isBlocked, isValidFriendUserId } from "./friends.js";
import { listGroupParticipantIds, userCanAccessGroup } from "./groups.js";
import { createFrozenShare } from "./shares.js";
import { isTitleId } from "./runs.js";

export const INBOX_CAP = 50;
/** Debounce only same sender → same recipient → same line (not cross-friend sends). */
export const RECIPIENT_SEND_COOLDOWN_MS = 10_000;

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

function oneLineIndicesJson(lineIndex: number): string {
  return JSON.stringify([lineIndex]);
}

/** Reuse a frozen 1-line share so multi-friend sends don't mint a new row each time. */
async function findReusableOneLineShare(
  db: D1Database,
  ownerId: string,
  titleId: string,
  lineIndex: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT id FROM mini_shares
       WHERE owner_user_id = ? AND title_id = ? AND revoked_at IS NULL
         AND line_indices = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(ownerId, titleId, oneLineIndicesJson(lineIndex))
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function issueShare(
  db: D1Database,
  user: User,
  appOrigin: string,
  titleId: string,
  lineIndex: number,
): Promise<LineShare | ActionError> {
  if (!isTitleId(titleId)) return { error: "Invalid title", status: 400 };
  const existingId = await findReusableOneLineShare(db, user.id, titleId, lineIndex);
  if (existingId) {
    return { shareId: existingId, url: playUrl(appOrigin, existingId) };
  }
  const share = await createFrozenShare(db, user, titleId, [lineIndex]);
  return { shareId: share.id, url: playUrl(appOrigin, share.id) };
}

async function recentSameRecipientSend(
  db: D1Database,
  senderId: string,
  recipientId: string,
  titleId: string,
  lineIndex: number,
): Promise<{ shareId: string; createdAt: string } | null> {
  const row = await db
    .prepare(
      `SELECT share_id, created_at FROM line_inbox
       WHERE sender_user_id = ? AND recipient_user_id = ?
         AND title_id = ? AND prompt_line_index = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(senderId, recipientId, titleId, lineIndex)
    .first<{ share_id: string; created_at: string }>();
  if (!row) return null;
  return { shareId: row.share_id, createdAt: row.created_at };
}

function withinCooldown(createdAt: string): boolean {
  const age = Date.now() - new Date(createdAt).getTime();
  return age >= 0 && age < RECIPIENT_SEND_COOLDOWN_MS;
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

  const prior = await recentSameRecipientSend(db, user.id, toUserId, titleId, lineIndex);
  if (prior && withinCooldown(prior.createdAt)) {
    return {
      error: "Already sent this line to them — wait a moment to resend",
      status: 429,
    };
  }
  if (prior) {
    return { shareId: prior.shareId, url: playUrl(appOrigin, prior.shareId) };
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

export type GroupLineShare = LineShare & {
  sent: number;
  skipped: number;
};

export async function sendLineToGroup(
  db: D1Database,
  user: User,
  appOrigin: string,
  titleIdRaw: string,
  lineIndexRaw: unknown,
  groupIdRaw: string,
): Promise<GroupLineShare | ActionError> {
  const titleId = titleIdRaw.trim();
  const lineIndex = parsePromptLineIndex(lineIndexRaw);
  const groupId = groupIdRaw.trim();
  if (!titleId || lineIndex == null) return { error: "Invalid line", status: 400 };
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };

  const group = await userCanAccessGroup(db, groupId, user.id);
  if (!group) return { error: "Group not found", status: 404 };

  const participants = await listGroupParticipantIds(db, groupId);
  const recipients = participants.filter((id) => id !== user.id);
  if (recipients.length === 0) {
    return { error: "This group has no one else to send to", status: 400 };
  }

  const eligible: string[] = [];
  for (const toUserId of recipients) {
    if (await isBlocked(db, user.id, toUserId)) continue;
    const prior = await recentSameRecipientSend(db, user.id, toUserId, titleId, lineIndex);
    if (prior && withinCooldown(prior.createdAt)) continue;
    if (prior) continue;
    const countRow = await db
      .prepare(`SELECT COUNT(*) AS n FROM line_inbox WHERE recipient_user_id = ?`)
      .bind(toUserId)
      .first<{ n: number }>();
    if (Number(countRow?.n ?? 0) >= INBOX_CAP) continue;
    eligible.push(toUserId);
  }

  const skipped = recipients.length - eligible.length;
  if (eligible.length === 0) {
    return { error: "No one in this group can receive this", status: 400 };
  }

  const share = await issueShare(db, user, appOrigin, titleId, lineIndex);
  if ("error" in share) return share;

  const createdAt = new Date().toISOString();
  for (const toUserId of eligible) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO line_inbox
           (id, share_id, sender_user_id, recipient_user_id, title_id, prompt_line_index, created_at, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(createId(), share.shareId, user.id, toUserId, titleId, lineIndex, createdAt, groupId)
      .run();
  }

  return { ...share, sent: eligible.length, skipped };
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

export async function markInboxSolved(
  db: D1Database,
  user: User,
  inboxIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const inboxId = inboxIdRaw.trim();
  if (!inboxId) return { error: "Invalid inbox item", status: 400 };
  const row = await db
    .prepare(
      `SELECT id, recipient_user_id, solved_at FROM line_inbox WHERE id = ?`,
    )
    .bind(inboxId)
    .first<{ id: string; recipient_user_id: string; solved_at: string | null }>();
  if (!row) return { error: "Not found", status: 404 };
  if (row.recipient_user_id !== user.id) return { error: "Not found", status: 404 };
  if (row.solved_at) return { ok: true };
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE line_inbox SET solved_at = ? WHERE id = ? AND solved_at IS NULL`)
    .bind(now, inboxId)
    .run();
  return { ok: true };
}
