-- Films we have already shown from TMDB search. Not a mirror of the database.
CREATE TABLE IF NOT EXISTS tmdb_films (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER NOT NULL
);

-- One row per person per film. Filling the request stays a hand job.
CREATE TABLE IF NOT EXISTS title_requests (
  user_id TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tmdb_id)
);

CREATE INDEX IF NOT EXISTS idx_title_requests_created
  ON title_requests (created_at DESC);
