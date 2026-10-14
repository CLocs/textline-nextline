-- Wikiquote hits are the line itself, not a quiz setup.
-- Move those star rows onto the quote mark, then drop them from the star pool.
INSERT INTO quotes (title_id, line_index, player_id, quoted_at, origin)
SELECT title_id, line_index, player_id, starred_at, 'wikiquote'
FROM stars
WHERE origin = 'wikiquote'
ON CONFLICT(title_id, line_index, player_id) DO NOTHING;

DELETE FROM stars WHERE origin = 'wikiquote';
