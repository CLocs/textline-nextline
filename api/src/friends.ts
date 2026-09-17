import { createShareId, daysFromNow, isExpired, sha256Hex } from "./crypto.js";
import type { User } from "./auth.js";

export const FRIEND_CAP = 50;
export const INVITE_TTL_DAYS = 30;
export const ROTATE_COOLDOWN_MS = 10_000;
export const INVITE_TOKEN_RE = /^[a-f0-9]{24}$/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FriendListItem = {
  userId: string;
  displayName: string;
};

export type InvitePreview = {
  displayName: string;
  isSelf?: boolean;
  alreadyFriends?: boolean;
};

export type InviteLink = {
  url: string | null;
  expiresAt: string;
  reused: boolean;
};

type ActionError = { error: string; status: number };

export function normalizeInviteToken(raw: string): string | null {
  const token = raw.trim().toLowerCase();
  return INVITE_TOKEN_RE.test(token) ? token : null;
}

export function isValidFriendUserId(id: string): boolean {
  return UUID_RE.test(id);
}

export function canonicalPair(a: string, b: string): { userA: string; userB: string } {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

function publicName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : "A player";
}

async function tokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

function friendUrl(appOrigin: string, token: string): string {
  return `${appOrigin.replace(/\/$/, "")}/#/friend/${token}`;
}

async function friendCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM friendships WHERE user_a = ? OR user_b = ?`,
    )
    .bind(userId, userId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function areFriends(db: D1Database, a: string, b: string): Promise<boolean> {
  const { userA, userB } = canonicalPair(a, b);
  const row = await db
    .prepare(`SELECT user_a FROM friendships WHERE user_a = ? AND user_b = ?`)
    .bind(userA, userB)
    .first<{ user_a: string }>();
  return Boolean(row);
}

async function isBlocked(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT blocker_user_id FROM friend_blocks
       WHERE (blocker_user_id = ? AND blocked_user_id = ?)
          OR (blocker_user_id = ? AND blocked_user_id = ?)`,
    )
    .bind(a, b, b, a)
    .first<{ blocker_user_id: string }>();
  return Boolean(row);
}

async function loadInviteByHash(
  db: D1Database,
  hash: string,
): Promise<{ inviterUserId: string; expiresAt: string | null } | null> {
  const row = await db
    .prepare(
      `SELECT inviter_user_id, expires_at FROM friend_invites WHERE token_hash = ?`,
    )
    .bind(hash)
    .first<{ inviter_user_id: string; expires_at: string | null }>();
  if (!row) return null;
  if (row.expires_at && isExpired(row.expires_at)) return null;
  return { inviterUserId: row.inviter_user_id, expiresAt: row.expires_at };
}

async function issueInvite(
  db: D1Database,
  user: User,
  appOrigin: string,
): Promise<InviteLink> {
  const token = createShareId();
  const hash = await tokenHash(token);
  const createdAt = new Date().toISOString();
  const expiresAt = daysFromNow(INVITE_TTL_DAYS);
  await db
    .prepare(`DELETE FROM friend_invites WHERE inviter_user_id = ?`)
    .bind(user.id)
    .run();
  await db
    .prepare(
      `INSERT INTO friend_invites (token_hash, inviter_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(hash, user.id, createdAt, expiresAt)
    .run();
  return { url: friendUrl(appOrigin, token), expiresAt, reused: false };
}

export async function getOrCreateInvite(
  db: D1Database,
  user: User,
  appOrigin: string,
): Promise<InviteLink | ActionError> {
  const existing = await db
    .prepare(
      `SELECT created_at, expires_at FROM friend_invites WHERE inviter_user_id = ?`,
    )
    .bind(user.id)
    .first<{ created_at: string; expires_at: string | null }>();

  if (existing && (!existing.expires_at || !isExpired(existing.expires_at))) {
    return {
      url: null,
      expiresAt: existing.expires_at ?? daysFromNow(INVITE_TTL_DAYS),
      reused: true,
    };
  }

  return issueInvite(db, user, appOrigin);
}

export async function rotateInvite(
  db: D1Database,
  user: User,
  appOrigin: string,
): Promise<InviteLink | ActionError> {
  const existing = await db
    .prepare(`SELECT created_at FROM friend_invites WHERE inviter_user_id = ?`)
    .bind(user.id)
    .first<{ created_at: string }>();

  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age >= 0 && age < ROTATE_COOLDOWN_MS) {
      return { error: "Please wait a moment before rotating your link", status: 429 };
    }
  }

  return issueInvite(db, user, appOrigin);
}

export async function previewInvite(
  db: D1Database,
  tokenRaw: string,
  viewer: User | null,
): Promise<InvitePreview | ActionError> {
  const token = normalizeInviteToken(tokenRaw);
  if (!token) return { error: "Invalid invite", status: 400 };

  const invite = await loadInviteByHash(db, await tokenHash(token));
  if (!invite) return { error: "Invite not found", status: 404 };

  const inviter = await db
    .prepare(`SELECT display_name FROM users WHERE id = ?`)
    .bind(invite.inviterUserId)
    .first<{ display_name: string | null }>();
  if (!inviter) return { error: "Invite not found", status: 404 };

  const preview: InvitePreview = { displayName: publicName(inviter.display_name) };
  if (viewer) {
    preview.isSelf = viewer.id === invite.inviterUserId;
    preview.alreadyFriends = await areFriends(db, viewer.id, invite.inviterUserId);
  }
  return preview;
}

export async function acceptInvite(
  db: D1Database,
  user: User,
  tokenRaw: string,
): Promise<{ ok: true; alreadyFriends?: boolean } | ActionError> {
  const token = normalizeInviteToken(tokenRaw);
  if (!token) return { error: "Invalid invite", status: 400 };

  const invite = await loadInviteByHash(db, await tokenHash(token));
  if (!invite) return { error: "Invite not found", status: 404 };
  if (invite.inviterUserId === user.id) {
    return { error: "That's your own link", status: 400 };
  }
  if (await isBlocked(db, user.id, invite.inviterUserId)) {
    return { error: "Can't add this person", status: 403 };
  }
  if (await areFriends(db, user.id, invite.inviterUserId)) {
    return { ok: true, alreadyFriends: true };
  }

  const myCount = await friendCount(db, user.id);
  const theirCount = await friendCount(db, invite.inviterUserId);
  if (myCount >= FRIEND_CAP || theirCount >= FRIEND_CAP) {
    return { error: "Friend list is full", status: 400 };
  }

  const { userA, userB } = canonicalPair(user.id, invite.inviterUserId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)`,
    )
    .bind(userA, userB, new Date().toISOString())
    .run();
  return { ok: true };
}

export async function listFriends(db: D1Database, userId: string): Promise<FriendListItem[]> {
  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.display_name
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY u.display_name COLLATE NOCASE`,
    )
    .bind(userId, userId, userId)
    .all<{ user_id: string; display_name: string | null }>();

  return (result.results ?? []).map((row) => ({
    userId: row.user_id,
    displayName: publicName(row.display_name),
  }));
}

export async function unfriend(
  db: D1Database,
  userId: string,
  otherId: string,
): Promise<{ ok: true } | ActionError> {
  if (!isValidFriendUserId(otherId) || otherId === userId) {
    return { error: "Invalid user", status: 400 };
  }
  const { userA, userB } = canonicalPair(userId, otherId);
  await db
    .prepare(`DELETE FROM friendships WHERE user_a = ? AND user_b = ?`)
    .bind(userA, userB)
    .run();
  return { ok: true };
}

export async function blockUser(
  db: D1Database,
  user: User,
  otherId: string,
): Promise<{ ok: true } | ActionError> {
  if (!isValidFriendUserId(otherId) || otherId === user.id) {
    return { error: "Invalid user", status: 400 };
  }
  const { userA, userB } = canonicalPair(user.id, otherId);
  await db
    .prepare(`DELETE FROM friendships WHERE user_a = ? AND user_b = ?`)
    .bind(userA, userB)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_blocks (blocker_user_id, blocked_user_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .bind(user.id, otherId, new Date().toISOString())
    .run();
  return { ok: true };
}
