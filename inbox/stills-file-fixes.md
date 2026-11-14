# Stills that need a better subtitle

No episode needs a new video. The Blu-rays stay. The English track already inside each MKV is the timing that matched the picture.

7x01 through 7x06 were replaced from the new SRTs and re-extracted on 2026-11-12. Season 8 was re-extracted the same day from the Blu-ray FGT files already in the folder. The new `thrones801.srt` through `thrones806.srt` are still about a minute early, so they were not imported. Seasons 6, 7, and 8 were uploaded on 2026-11-12. 7x07 is still the old transcript, and those frames are already on R2. A later subtitle would leave the old remote objects in place.

Breaking Bad 5x01 through 5x08 and 5x13 through 5x16 were re-extracted from the new SRTs on 2026-11-12. Those clocks sit on the Blu-ray. 5x09 through 5x12 were checked again on 2026-11-13 against both subtitle versions. Neither lands on the Blu-ray, so those episodes stay on the earlier extract. Season 5 was never uploaded.

Ted Lasso seasons 1 through 3 were synced and extracted on 2026-11-13. The catalog is 1.0s late on seasons 1 and 3, and 957ms late on season 2, the same slip on every line. 20,839 frames, none failed. Season 4 was not extracted. Nothing from Ted Lasso was uploaded. A few season 1 files include an addic7ed credit line, and that line got a still. The picture clock is fine, so those episodes are not on the list.

## Replace the subtitle

Opening lines are stuck on frame 0 because the catalog starts before the Blu-ray.

| Show | Season | Episode | Problem | Action | Where to look |
|---|---:|---|---|---|---|
| Game of Thrones | 7 | 7x07 The Dragon and the Wolf | Catalog is 85s early. Opening lines are frame 0. The newer `thrones707.srt` is worse: about 95s early, with 20 opening lines before the file. Those frames are already on R2. | New SRT | Same Blu-ray. English track in `S07E07_The Dragon and the Wolf.mkv`. Leave the current transcript until a file that starts inside the episode turns up. A file like the season 8 Blu-ray FGT subtitles (about 3s early, nothing before the picture) is the shape that works. Replacing it later leaves the old remote objects in place. |

## Optional

These already show the right scene. A new SRT would only tighten a few seconds of drift, or drop a preview at the end. Dead Freight now uses the new Blu-ray subtitle at scale 1.

| Show | Season | Episode | Problem | Action | Where to look |
|---|---:|---|---|---|---|
| Breaking Bad | 4 | 4x02 Thirty-Eight Snub | Catalog is 26s early and drifts about 3s. Both checked frames are the right scene. | New SRT | Optional. Current file is an HDTV sync (PROPER.FQM). A Blu-ray SRT, or stream 3 in the S04E02 MKV, is the tight clock. |
| Breaking Bad | 4 | 4x03 Open House | Catalog is 26s early. One bad match at the open makes the raw spread look like 38s. The rest of the episode stays near 26s. | New SRT | Optional. Current file is 720p HDTV.ORENJI. Prefer a Blu-ray SRT, or stream 3 in the S04E03 MKV. |
| Breaking Bad | 4 | 4x04 Bullet Points | Catalog is 27s early and drifts about 3s. | New SRT | Optional. Current file is HDTV.FQM. Prefer a Blu-ray SRT, or stream 3 in the S04E04 MKV. |
| Breaking Bad | 4 | 4x05 Shotgun | Catalog is 26s early. One bad match makes the raw spread look like 79s. The rest stays near 26s. | New SRT | Optional. Current file is HDTV.FQM. Prefer a Blu-ray SRT, or stream 3 in the S04E05 MKV. |
| Breaking Bad | 4 | 4x09 Bug | Catalog runs from about 1s late to 4s late. Checked frames are Walt outside the house and Mike in the living room. | New SRT | Optional. A Blu-ray SRT, or stream 3 in the S04E09 MKV, removes the drift. |
| Breaking Bad | 5 | 5x09 Blood Money | Both files were checked. `Breaking.Bad.S5E9-en.srt` is about 3.6s early and lines wander about 7s, with end times that fall before the start. The 720p HDTV.IMMERSE file is 26s early and puts 12 opening lines before the picture. | New SRT | Leave the current extract. The English track in the S05E09 MKV, stream 2, is the clock that matches. |
| Breaking Bad | 5 | 5x10 Buried | `Breaking.Bad.S5E10-en.srt` is about 3.7s early and wanders about 7s. The HDTV.IMMERSE file is 26s early, with 11 opening lines before the picture. | New SRT | Leave the current extract. Stream 2 in the S05E10 MKV. |
| Breaking Bad | 5 | 5x11 Confessions | `Breaking.Bad.S5E11-en.srt` is about 3.9s early and wanders about 7s. The HDTV.IMMERSE file is 27s early, with 11 opening lines before the picture. | New SRT | Leave the current extract. Stream 2 in the S05E11 MKV. |
| Breaking Bad | 5 | 5x12 Rabid Dog | `Breaking.Bad.S5E12-en.srt` is about 3.6s early and wanders about 7s. The HDTV.EVOLVE file is 32s early, with 10 opening lines before the picture. | New SRT | Leave the current extract. Stream 2 in the S05E12 MKV. |