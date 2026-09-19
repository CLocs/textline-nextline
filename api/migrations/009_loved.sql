-- Loved / double-star: bias mini-game queues (0 = starred only, 1 = loved)
ALTER TABLE stars ADD COLUMN loved INTEGER NOT NULL DEFAULT 0;
