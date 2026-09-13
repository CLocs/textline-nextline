-- Phase 2.5: persist completed runs + optional thumbs
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
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_ratings (
  run_id TEXT PRIMARY KEY,
  thumb TEXT NOT NULL,
  rated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_user_completed ON runs (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_title ON runs (title_id);
