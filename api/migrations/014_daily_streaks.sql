-- Consecutive days a player finished the three-question daily game.
CREATE TABLE IF NOT EXISTS daily_streaks (
  user_id TEXT PRIMARY KEY,
  last_completed_on TEXT NOT NULL,
  streak INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
