-- Phase 2a: auth + share mini-games
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
  revoked_at TEXT
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
