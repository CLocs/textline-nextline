-- Frozen exact-replay shares: persist mini-game prompt queues
-- Not idempotent (SQLite has no ADD COLUMN IF NOT EXISTS).
-- Repeat deploys: npm run db:migrate:shares:remote (api/scripts/ensure-share-columns.mjs)
ALTER TABLE runs ADD COLUMN question_queue TEXT;
ALTER TABLE mini_shares ADD COLUMN line_indices TEXT;
