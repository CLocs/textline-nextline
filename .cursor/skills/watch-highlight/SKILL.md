---
name: watch-highlight
description: >-
  While the user is watching a movie, import the SRT so they can star lines
  in Curate, and keep a watch session of w2g notes, people those notes are
  for, and a Pocket recording anchor so spoken audio can become notes later.
  Use when they say they are watching, want to highlight a transcript, star
  while watching, "w2g notes", watch2gether notes, notes that link to people,
  they are recording the watch with Pocket, they drop an SRT, they want
  the transcript to scroll in real time with the movie, or they highlighted
  in Readwise and want those lines imported for one title.
---

# Watch and highlight

Stars in Curate are the highlight. Notes are not in the app. A watch session file holds w2g notes, the people they are for, and the Pocket clock until a notes table exists. Do not invent a notes API or write D1 stars unless they name a line and ask to star it.

A full library ingest (stills, Wikiquote, Readwise, stars-push) is [content-ingest](../content-ingest/SKILL.md). During a watch, stop after import.

## While they are watching

1. **Name the film from the file.** Read the SRT header and the last cue. A credit line like `The Odyssey (1997)` plus a ~3h track is that miniseries. Do not swap in a different film with the same title.

2. **Import only if the title is missing** from `content/catalog.json`. Copy is not required when you pass a clean `--source` name. `batch:export` is not in this machine's transcript_maker; use the script here (it calls the sibling cleaners and refuses a track under 500 cues):

   ```bash
   npx tsx .cursor/skills/watch-highlight/scripts/export-srt.ts \
     --srt "inbox/srt/FILE.srt" \
     --out imports/Name-Year.json \
     --title "Name (Year)" \
     --year YEAR \
     --source "Name.Year.eng.srt"
   npm run import -- imports/Name-Year.json
   ```

   Do not deploy, commit, extract stills, or run `content:stars-push`. The title is in the local catalog. The live site shows it only after a Pages deploy they ask for.

3. **Point Curate at remote D1 before the first star.** `.env.local` must contain:

   ```
   VITE_API_URL=https://textline-nextline-api.dascolin.workers.dev
   ```

   Restart `npm run dev`. They sign in on that localhost tab. Each star is then a row in the production D1 (`textline-stars`). `http://localhost:8787` is a different database. With no `VITE_API_URL`, the star stays in that browser and is never uploaded. Do not re-import after they star. `title_id` + `lineIndex` is the D1 key. Search the title and open **Curate**. They tap the star. Love stays theirs.

   Pages (`npm run deploy`, [deploy](../deploy/SKILL.md)) when they ask, so the title shows on the live site. The star rows are already there.

   Catalog already has a Requests tab. Do not add an import tab. The SRT, the catalog write, and the deploy stay in this skill.

4. **Open or create** `inbox/watch/<title-id>.json` (gitignored). One file per title. Append. Do not overwrite notes already there.

5. **Ask for the Pocket anchor** if `pocket.movieMsAtStart` is null and they said they are recording. You need the movie time when Pocket started (or "at the studio logo"). Wall clock alone cannot place a line.

## Session file

```json
{
  "titleId": "the-odyssey-1997",
  "title": "The Odyssey (1997)",
  "srt": "inbox/srt/THE ODYSSEY-en.srt",
  "highlights": "readwise",
  "pocket": {
    "recorder": "pocket",
    "startedAt": null,
    "movieMsAtStart": null
  },
  "follow": {
    "source": null,
    "offsetMs": null,
    "timeScale": null,
    "confirmedAt": null
  },
  "people": [],
  "notes": [],
  "stars": []
}
```

- `people` — names they are watching with. Display names as they said them. Do not look up accounts unless they ask.
- `notes[]` — `{ "movieMs": 0, "text": "", "people": [] }`. A w2g note is a note from the room. `people` on the note are who it is for (a subset of the room, or someone not present). No Watch2Gether link unless they paste one.
- `stars[]` — `{ "lineIndex": 0, "text": "" }` they asked to keep. `lineIndex` is the catalog line index (0-based), the same number Curate shows as Line N minus 1.

When they call out a quote, find that line in `content/titles/<title-id>.json` and give them **Line N** plus the text so they can star it in Curate. Append `stars` only after they confirm that line.

## Pocket, after the recording

They record the room on Pocket. Duration is the length of that recording, not the movie. Do not transcribe it here. When they bring a Pocket transcript:

1. Refuse to attach anything if `movieMsAtStart` is null.
2. For each spoken span, `movieMs = movieMsAtStart + offsetMs` inside the Pocket transcript.
3. Attach the text to the playable line where `startMs <= movieMs && movieMs < endMs`. If none, use the nearest `startMs` and say the gap.
4. A span that is them saying to star or highlight that moment goes in `stars` as a proposal. Show the line. Wait.
5. Any other span is a note. Keep names they say in `people`.
6. A duration with no transcript only fills `pocket.durationMs`. It does not become notes.

## Readwise, after the watch

Highlighting in Readwise is the source when they say so. Readwise syncs to Obsidian. Do not ask them to star those same lines in Curate, and do not copy the highlights into the session file. Set `highlights` to `"readwise"` on the session.

When they say the vault has the note, match that title only. This does not rewrite the rest of `stars-seed.json` and does not write D1:

```bash
npm run content:vault-title -- --title TITLE_ID --vault "<readwise-dir>"
npm run content:stars-push -- --email dascolin@gmail.com --title TITLE_ID --remote --dry-run
```

**Stop.** Show how many lines would insert. Wait. Then drop `--dry-run`. Use `--merge` when the title already has their stars. Never `--force` a title in `stars-protected.json`. A note under a highlight stays on the seed. It is not a D1 column. `content:queue` rewrites the whole seed. Do not use it for one watch.

## Follow the picture

Later, the transcript scrolls in real time with the movie. That follow is not built. Do not add a player, and do not upload or scrape the movie. The file stays on this machine, same as stills.

Some initiation and confirmation is required locally to record the clock.

1. **Initiate.** They name the local file, or they say which line is on screen right now. Write that path on `follow.source` only in the session file. It never goes to Pages, R2, or D1.
2. **Confirm.** Show the line you think is on screen. Wait until they say it matches. Then set `follow.confirmedAt`. Leave it null until then, and do not pretend the list is following.
3. **Clock.** A confirmed `content/stills-sync.json` row (`offsetMs`, `timeScale`, `syncedAt`) is the starting clock. One confirmation still has to happen for this watch. A same slip on the lock is an `offsetMs`. Early right and late wrong is the cue to try `timeScale` 0.96 before recording it. Do not record 0.96 on a guess.

When they ask to follow during a watch, say it is not built, and store the confirmed line plus the movie time they gave.

## Report

Title id, line count, last cue time, session path, and whether the Pocket anchor is still missing. Say the live site does not have the film until they ask to deploy.
