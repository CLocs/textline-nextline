-- Frozen exact-replay shares: persist mini-game prompt queues
ALTER TABLE runs ADD COLUMN question_queue TEXT;
ALTER TABLE mini_shares ADD COLUMN line_indices TEXT;
