-- Profile photo. JPEG bytes stay off the friend-list query; avatar_at is the cache key.
-- Remote/local apply is scripts/ensure-share-columns.mjs (ADD COLUMN is not idempotent).
ALTER TABLE users ADD COLUMN avatar_at TEXT;
ALTER TABLE users ADD COLUMN avatar BLOB;
