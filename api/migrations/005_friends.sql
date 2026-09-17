-- Friends graph: invite-only mutual links (no user directory)
CREATE TABLE IF NOT EXISTS friend_invites (
  token_hash TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS friend_blocks (
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships (user_b);
CREATE INDEX IF NOT EXISTS idx_friend_blocks_blocked ON friend_blocks (blocked_user_id);
