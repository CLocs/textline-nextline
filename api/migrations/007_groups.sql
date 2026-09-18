-- Owner-only friend send-lists (not shared clubs)
CREATE TABLE IF NOT EXISTS friend_groups (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_group_members (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_groups_owner ON friend_groups (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_group_members_user ON friend_group_members (user_id);
