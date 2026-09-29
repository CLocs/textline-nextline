import { areFriends, isValidFriendUserId } from "./friends.js";

export const AVATAR_MAX_BYTES = 200_000;

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function saveAvatar(
  db: D1Database,
  userId: string,
  bytes: Uint8Array,
): Promise<{ avatarAt: string } | { error: string; status: number }> {
  if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_MAX_BYTES || !isJpeg(bytes)) {
    return { error: "Use a JPEG under 200 KB", status: 400 };
  }
  const avatarAt = new Date().toISOString();
  await db
    .prepare(`UPDATE users SET avatar = ?, avatar_at = ? WHERE id = ?`)
    .bind(bytes, avatarAt, userId)
    .run();
  return { avatarAt };
}

export async function clearAvatar(db: D1Database, userId: string): Promise<{ avatarAt: null }> {
  await db.prepare(`UPDATE users SET avatar = NULL, avatar_at = NULL WHERE id = ?`).bind(userId).run();
  return { avatarAt: null };
}

export async function fetchAvatarAt(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT avatar_at FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ avatar_at: string | null }>();
  return row?.avatar_at ?? null;
}

export async function readAvatar(
  db: D1Database,
  viewerId: string,
  subjectId: string,
): Promise<{ bytes: Uint8Array } | { error: string; status: number }> {
  if (!isValidFriendUserId(subjectId)) return { error: "Not found", status: 404 };
  if (viewerId !== subjectId && !(await areFriends(db, viewerId, subjectId))) {
    return { error: "Not found", status: 404 };
  }
  const row = await db
    .prepare(`SELECT avatar FROM users WHERE id = ? AND avatar_at IS NOT NULL`)
    .bind(subjectId)
    .first<{ avatar: ArrayBuffer | Uint8Array | null }>();
  const avatar = row?.avatar;
  if (!avatar) return { error: "Not found", status: 404 };
  const bytes = avatar instanceof Uint8Array ? avatar : new Uint8Array(avatar);
  if (!isJpeg(bytes)) return { error: "Not found", status: 404 };
  return { bytes };
}
