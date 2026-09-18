---
name: content-ingest
description: >-
  Converts new inbox/srt files (.srt/.sub/.vtt) via transcript_maker, imports
  only new catalog titles, matches Readwise highlights, and pushes stars to D1
  without overwriting curated titles. Use when the user says "run content
  ingest", "content ingest", "I added more movies to inbox/srt", convert/import
  subtitles, Simpsons .sub files, match Readwise, "stars-push", "don't overwrite
  my stars", "protect curated stars", or "check my stars then push".
---

# Content ingest

Run this whole pipeline in one go unless the user asks to stop after a step.

## Procedure

1. **Detect new files.** List `inbox/srt/` (and named subfolders like `Simpsons_S5`). `batch:export` is **not recursive**. Compare filenames/titles to `content/catalog.json`. Skip anything already imported. Never re-import titles in `content/stars-protected.json`.

2. **Clean names.** Copy new files to a temp dir with titles like `Barbie.2023.eng.srt`. Release-group names leak into catalog titles.

3. **Convert** from sibling `../transcript_maker`:
   ```bash
   npm run batch:export -- <dir> --out ../textline-nextline/imports
   ```
   Skip tracks that are clearly incomplete (≲500 cues or starting ~20min in). `.sub` is supported.

4. **Import each NEW json only** (never `import:all` — that remaps `lineIndex` and breaks stars):
   ```bash
   npm run import -- imports/Barbie-2023.json
   ```

5. **Match Readwise** (vault is local; TV matches catalog episode names, not just Letterboxd):
   ```bash
   npm run content:queue -- --from inbox/letterboxd --vault "C:\Users\dasco\Documents\clocs\Readwise"
   ```

6. **Protect curated stars, then push** for `dascolin@gmail.com`. Never `--force`.
   1. Query prod D1 star counts vs `content/stars-seed.json`.
   2. Add every title where live ≠ seed to `content/stars-protected.json` (and `DEFAULT_PROTECTED_TITLE_IDS`).
   3. Dry-run:
      ```bash
      npm run content:stars-push -- --email dascolin@gmail.com --remote --dry-run
      ```
   4. **Stop.** Show skip vs insert. Wait for the user to confirm.
   5. Then write (no `--force`):
      ```bash
      npm run content:stars-push -- --email dascolin@gmail.com --remote
      ```
   Skips protected ids even with `--force`. Also skips any title that already has live stars. Current lock: Wolf, Empire, Ocean's 13, Payback, Inglourious, Batman Begins, Django, The Gentlemen.

7. **Report.** New title ids, cue counts, Readwise hits, D1 skip vs insert, and that **Pages deploy** is still required for new movies to appear on the site. Transcripts live in git; D1 is stars only.

## Where things live

```mermaid
flowchart TD
  inbox["inbox/srt gitignored"]
  maker["transcript_maker"]
  imports["imports/*.json"]
  titles["content/titles + catalog.json"]
  vault["Readwise vault"]
  seed["stars-seed.json gitignored"]
  d1["D1 stars"]
  pages["Pages static site"]
  inbox --> maker --> imports --> titles --> pages
  vault --> seed
  titles --> seed --> d1
```

| Store | What goes live |
| --- | --- |
| `content/titles` + `catalog.json` | Playable lines. Commit + Pages deploy. |
| `content/stars-protected.json` | Title ids seed-push must never touch. |
| D1 `stars` | `(title_id, line_index, player_id)` after `stars-push --remote`. |
| Pages | UI + baked catalog. New titles invisible until deploy. |

## Follow-up

Protected titles skip the **whole film** so Curate unstars stay gone. Later: tombstones on unstar, then merge `seed − tombstones`.

**Next time:** `@` this file. Add “just stars” (step 6 only: protect + dry-run + wait) or “full ingest” (steps 1–7). Phrases like `content ingest` / `stars-push` still auto-match if you do not `@` it.
