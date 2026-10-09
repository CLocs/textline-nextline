-- One finished daily per user per calendar day, with the score.
-- The first finish of a day sticks. Days before this table are not recoverable from the streak.
CREATE TABLE IF NOT EXISTS daily_plays (
  user_id TEXT NOT NULL,
  completed_on TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  skip_count INTEGER NOT NULL,
  question_total INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, completed_on)
);

-- guessed_right is added on line_inbox by scripts/ensure-share-columns.mjs.
-- NULL on older solved rows: those stay solved, not correct.
