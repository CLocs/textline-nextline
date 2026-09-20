CREATE TABLE IF NOT EXISTS stars (
  title_id   TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  player_id  TEXT NOT NULL,
  starred_at TEXT NOT NULL,
  loved      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, line_index, player_id)
);

CREATE INDEX IF NOT EXISTS idx_stars_title ON stars (title_id);

-- Phase 2a: auth + share mini-games (also in migrations/002_auth_shares.sql)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_claims (
  anonymous_player_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mini_shares (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  line_indices TEXT
);

CREATE TABLE IF NOT EXISTS shared_runs (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  player_user_id TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  skip_count INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (share_id, player_user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_mini_shares_owner ON mini_shares (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_runs_share ON shared_runs (share_id);

-- Phase 2.5: persist completed runs + optional thumbs (also in migrations/003_runs.sql)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  length TEXT NOT NULL,
  mode TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  skip_count INTEGER NOT NULL,
  question_total INTEGER NOT NULL,
  end_reason TEXT NOT NULL,
  share_id TEXT,
  question_queue TEXT,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_ratings (
  run_id TEXT PRIMARY KEY,
  thumb TEXT NOT NULL,
  rated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_user_completed ON runs (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_title ON runs (title_id);

-- Friends graph: invite-only mutual links (also in migrations/005_friends.sql)
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

-- Directed one-line inbox (also in migrations/006_inbox.sql; read_at/group_id via ensure-share-columns + 011)
CREATE TABLE IF NOT EXISTS line_inbox (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  prompt_line_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (recipient_user_id, share_id)
);

CREATE INDEX IF NOT EXISTS idx_line_inbox_recipient ON line_inbox (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_inbox_sender ON line_inbox (sender_user_id, created_at DESC);
-- idx_line_inbox_group is created in migrations/011_chats.sql after group_id exists

-- Owner-only friend send-lists (also in migrations/007_groups.sql)
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


-- Quote parallels (Light)
CREATE TABLE IF NOT EXISTS analogy_packs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  line_indices TEXT NOT NULL,
  share_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analogy_packs_owner
  ON analogy_packs (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analogy_connections (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  note TEXT,
  proposer_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_analogy_connections_pack
  ON analogy_connections (pack_id, score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS analogy_votes (
  connection_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, user_id)
);

CREATE TABLE IF NOT EXISTS parallel_inbox (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  group_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (recipient_user_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_parallel_inbox_recipient
  ON parallel_inbox (recipient_user_id, created_at DESC);

-- Freeform chat text (also in migrations/012_chat_messages.sql)
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  dm_user_a TEXT,
  dm_user_b TEXT,
  group_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_dm
  ON chat_messages (dm_user_a, dm_user_b, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_group
  ON chat_messages (group_id, created_at);

CREATE TABLE IF NOT EXISTS chat_thread_reads (
  user_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_key)
);

-- Emoji reactions (also in migrations/013_chat_reactions.sql)
CREATE TABLE IF NOT EXISTS chat_reactions (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (target_kind, target_id, emoji, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_target
  ON chat_reactions (target_kind, target_id);
