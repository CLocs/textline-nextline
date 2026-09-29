-- Profile photo. JPEG bytes stay off the friend-list query; avatar_at is the cache key.
ALTER TABLE users ADD COLUMN avatar_at TEXT;
ALTER TABLE users ADD COLUMN avatar BLOB;
