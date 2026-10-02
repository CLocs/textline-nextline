-- Opt-in daily quote email. Unsubscribe token is a bearer secret, stored like a session id.
CREATE TABLE IF NOT EXISTS daily_mail (
  user_id TEXT PRIMARY KEY,
  opted_in INTEGER NOT NULL DEFAULT 0,
  unsub_token TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);

-- One row per user per New York calendar day so a retried cron does not send twice.
CREATE TABLE IF NOT EXISTS daily_mail_sends (
  user_id TEXT NOT NULL,
  sent_on TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, sent_on)
);
