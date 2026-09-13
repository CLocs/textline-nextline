CREATE TABLE IF NOT EXISTS stars (
  title_id   TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  player_id  TEXT NOT NULL,
  starred_at TEXT NOT NULL,
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
