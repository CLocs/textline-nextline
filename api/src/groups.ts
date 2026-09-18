import { createId } from "./crypto.js";
import type { User } from "./auth.js";
import { areFriends, isBlocked, isValidFriendUserId } from "./friends.js";

export const GROUP_CAP = 10;
export const GROUP_MEMBER_CAP = 20;
export const GROUP_NAME_MAX = 40;
export const GROUP_CREATE_COOLDOWN_MS = 10_000;

export type GroupMember = {
  userId: string;
  displayName: string;
};

export type FriendGroup = {
  id: string;
  name: string;
  createdAt: string;
  members: GroupMember[];
};

type ActionError = { error: string; status: number };

function publicName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : "A player";
}

export function normalizeGroupName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > GROUP_NAME_MAX) return null;
  return name;
}

async function ownedGroup(
  db: D1Database,
  ownerUserId: string,
  groupId: string,
): Promise<{ id: string } | null> {
  return db
    .prepare(`SELECT id FROM friend_groups WHERE id = ? AND owner_user_id = ?`)
    .bind(groupId, ownerUserId)
    .first<{ id: string }>();
}

export async function listGroupMemberIds(db: D1Database, groupId: string): Promise<string[]> {
  const result = await db
    .prepare(`SELECT user_id FROM friend_group_members WHERE group_id = ?`)
    .bind(groupId)
    .all<{ user_id: string }>();
  return (result.results ?? []).map((row) => row.user_id);
}

export async function listGroups(db: D1Database, ownerUserId: string): Promise<FriendGroup[]> {
  const groupsResult = await db
    .prepare(
      `SELECT id, name, created_at FROM friend_groups WHERE owner_user_id = ? ORDER BY created_at, id`,
    )
    .bind(ownerUserId)
    .all<{ id: string; name: string; created_at: string }>();

  const membersResult = await db
    .prepare(
      `SELECT m.group_id, u.id AS user_id, u.display_name
       FROM friend_group_members m
       JOIN friend_groups g ON g.id = m.group_id
       JOIN users u ON u.id = m.user_id
       WHERE g.owner_user_id = ?
       ORDER BY u.display_name COLLATE NOCASE`,
    )
    .bind(ownerUserId)
    .all<{ group_id: string; user_id: string; display_name: string | null }>();

  const membersByGroup = new Map<string, GroupMember[]>();
  for (const row of membersResult.results ?? []) {
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push({ userId: row.user_id, displayName: publicName(row.display_name) });
    membersByGroup.set(row.group_id, list);
  }

  return (groupsResult.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    members: membersByGroup.get(row.id) ?? [],
  }));
}

export async function createGroup(
  db: D1Database,
  user: User,
  nameRaw: string,
): Promise<FriendGroup | ActionError> {
  const name = normalizeGroupName(nameRaw);
  if (!name) return { error: "Invalid group name", status: 400 };

  const last = await db
    .prepare(
      `SELECT created_at FROM friend_groups WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(user.id)
    .first<{ created_at: string }>();
  if (last) {
    const age = Date.now() - new Date(last.created_at).getTime();
    if (age >= 0 && age < GROUP_CREATE_COOLDOWN_MS) {
      return { error: "Please wait a moment before creating another group", status: 429 };
    }
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM friend_groups WHERE owner_user_id = ?`)
    .bind(user.id)
    .first<{ n: number }>();
  if (Number(countRow?.n ?? 0) >= GROUP_CAP) {
    return { error: "Too many groups", status: 400 };
  }

  const createdAt = new Date().toISOString();
  const id = createId();
  await db
    .prepare(
      `INSERT INTO friend_groups (id, owner_user_id, name, created_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(id, user.id, name, createdAt)
    .run();

  return { id, name, createdAt, members: [] };
}

export async function addGroupMember(
  db: D1Database,
  user: User,
  groupIdRaw: string,
  memberIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const groupId = groupIdRaw.trim();
  const memberId = memberIdRaw.trim();
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };
  if (!isValidFriendUserId(memberId) || memberId === user.id) {
    return { error: "Invalid user", status: 400 };
  }

  const group = await ownedGroup(db, user.id, groupId);
  if (!group) return { error: "Group not found", status: 404 };
  if (!(await areFriends(db, user.id, memberId))) {
    return { error: "You can only add friends", status: 403 };
  }
  if (await isBlocked(db, user.id, memberId)) {
    return { error: "Can't add this person", status: 403 };
  }

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM friend_group_members WHERE group_id = ?`)
    .bind(groupId)
    .first<{ n: number }>();
  if (Number(countRow?.n ?? 0) >= GROUP_MEMBER_CAP) {
    return { error: "This group is full", status: 400 };
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)`,
    )
    .bind(groupId, memberId, new Date().toISOString())
    .run();
  return { ok: true };
}

export async function removeGroupMember(
  db: D1Database,
  user: User,
  groupIdRaw: string,
  memberIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const groupId = groupIdRaw.trim();
  const memberId = memberIdRaw.trim();
  if (!isValidFriendUserId(groupId) || !isValidFriendUserId(memberId)) {
    return { error: "Invalid user", status: 400 };
  }
  const group = await ownedGroup(db, user.id, groupId);
  if (!group) return { error: "Group not found", status: 404 };
  await db
    .prepare(`DELETE FROM friend_group_members WHERE group_id = ? AND user_id = ?`)
    .bind(groupId, memberId)
    .run();
  return { ok: true };
}

export async function deleteGroup(
  db: D1Database,
  user: User,
  groupIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const groupId = groupIdRaw.trim();
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };
  const group = await ownedGroup(db, user.id, groupId);
  if (!group) return { error: "Group not found", status: 404 };
  await db.prepare(`DELETE FROM friend_group_members WHERE group_id = ?`).bind(groupId).run();
  await db
    .prepare(`DELETE FROM friend_groups WHERE id = ? AND owner_user_id = ?`)
    .bind(groupId, user.id)
    .run();
  return { ok: true };
}
