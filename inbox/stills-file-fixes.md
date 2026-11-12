# Stills that need a better subtitle

No episode needs a new video. The Blu-rays stay. The English track already inside each MKV is the timing that matched the picture.

7x01 through 7x06 were replaced from the new SRTs and re-extracted locally on 2026-11-12. Season 8 was re-extracted the same day from the Blu-ray FGT files already in the folder. The new `thrones801.srt` through `thrones806.srt` are still about a minute early, so they were not imported. Seasons 7 and 8 were never uploaded, so there is nothing on R2 to delete for these episodes.

## Replace the subtitle

Opening lines are stuck on frame 0 because the catalog starts before the Blu-ray.

| Show | Season | Episode | Problem | Action | Where to look |
|---|---:|---|---|---|---|
| Game of Thrones | 7 | 7x07 The Dragon and the Wolf | Catalog is 85s early. Opening lines are frame 0. The newer `thrones707.srt` is worse: about 95s early, with 20 opening lines before the file. | New SRT | Same Blu-ray. English track in `S07E07_The Dragon and the Wolf.mkv`. Leave the current transcript until a file that starts inside the episode turns up. A file like the season 8 Blu-ray FGT subtitles (about 3s early, nothing before the picture) is the shape that works. |

## Optional

These already show the right scene. A new SRT would only tighten a few seconds of drift, or drop a preview at the end. Dead Freight is left off because its 2.1% scale is already recorded and the train trestle matches.

| Show | Season | Episode | Problem | Action | Where to look |
|---|---:|---|---|---|---|
| Breaking Bad | 4 | 4x02 Thirty-Eight Snub | Catalog is 26s early and drifts about 3s. Both checked frames are the right scene. | New SRT | Optional. Current file is an HDTV sync (PROPER.FQM). A Blu-ray SRT, or stream 3 in the S04E02 MKV, is the tight clock. |
| Breaking Bad | 4 | 4x03 Open House | Catalog is 26s early. One bad match at the open makes the raw spread look like 38s. The rest of the episode stays near 26s. | New SRT | Optional. Current file is 720p HDTV.ORENJI. Prefer a Blu-ray SRT, or stream 3 in the S04E03 MKV. |
| Breaking Bad | 4 | 4x04 Bullet Points | Catalog is 27s early and drifts about 3s. | New SRT | Optional. Current file is HDTV.FQM. Prefer a Blu-ray SRT, or stream 3 in the S04E04 MKV. |
| Breaking Bad | 4 | 4x05 Shotgun | Catalog is 26s early. One bad match makes the raw spread look like 79s. The rest stays near 26s. | New SRT | Optional. Current file is HDTV.FQM. Prefer a Blu-ray SRT, or stream 3 in the S04E05 MKV. |
| Breaking Bad | 4 | 4x09 Bug | Catalog runs from about 1s late to 4s late. Checked frames are Walt outside the house and Mike in the living room. | New SRT | Optional. A Blu-ray SRT, or stream 3 in the S04E09 MKV, removes the drift. |
| Breaking Bad | 5 | 5x01 Live Free or Die | Catalog is 26s early and drifts about 3s. Checked frames are the Denny's open and Skyler in the bedroom. | New SRT | Optional. Current file is an HDTV sync. Stream 3 in the S05E01 MKV is the tight clock. |
| Breaking Bad | 5 | 5x03 Hazard Pay | Catalog is 25s early and drifts about 6s, the softest clock in the set. Checked frames are still Saul at the jail and Walt on Gus. | New SRT | Optional, and the one worth doing if you only replace one Breaking Bad file. Stream 3 in the S05E03 MKV. |
| Breaking Bad | 5 | 5x04 Fifty-One | Catalog is 2s late and drifts about 3s. | New SRT | Optional. HDTV sync. Stream 3 in the S05E04 MKV. |
| Breaking Bad | 5 | 5x07 Say My Name | Catalog is 26s early and drifts about 4s. | New SRT | Optional. HDTV sync. Stream 3 in the S05E07 MKV. |
| Breaking Bad | 5 | 5x08 Gliding Over All | Catalog is 24s early and drifts about 5s. | New SRT | Optional. HDTV sync. Stream 3 in the S05E08 MKV. Season 5B files have only one English track, stream 2. |
| Breaking Bad | 5 | 5x09 Blood Money | Catalog is 26s early and drifts about 3s. | New SRT | Optional. HDTV sync. Season 5B has a single English track, stream 2, in the S05E09 MKV. |
| Breaking Bad | 5 | 5x11 Confessions | Catalog is 27s early and drifts about 3s. | New SRT | Optional. HDTV sync. Stream 2 in the S05E11 MKV. |
| Breaking Bad | 5 | 5x13 To'hajiilee | Catalog is 32s early and drifts about 3s. | New SRT | Optional. HDTV sync. Stream 2 in the S05E13 MKV. |
| Breaking Bad | 5 | 5x14 Ozymandias | Catalog is 26s early and drifts about 3s. | New SRT | Optional. HDTV sync. Stream 2 in the S05E14 MKV. |
| Breaking Bad | 5 | 5x15 Granite State | Catalog is 30s early. The last 6 lines are a Felina preview and a series-finale promo, so they have no frame. | New SRT | Optional for the clock. Worth it to drop the tail, which starts around "Chemistry is the study of transformation" and ends at the AMC promo. Stream 2 in the S05E15 MKV. |