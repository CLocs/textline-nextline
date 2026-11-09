---
name: watch-highlight
description: >-
  While the user is watching a movie, import the SRT so they can star lines
  in Curate, and keep a watch session. Room chatter, HeyPocket transcripts,
  and speaker labels are the line-notes skill. Use when they say they are
  watching, want to highlight a transcript, star while watching, they drop
  an SRT, they want the transcript to scroll in real time with the movie,
  or they highlighted in Readwise and want those lines imported for one title.
  w2g is this watch: highlight, tap Sync, and notes.
---

# Watch and highlight

**w2g** is watch together done right. Plan: [W2G.md](../../../docs/W2G.md). Stars in Curate are the highlight. Sync is the live list. Notes on a line are [line-notes](../line-notes/SKILL.md). Do not invent a notes API or write D1 stars unless they name a line and ask to star it.

**The film is already in TLNL.** They open it and star lines in Curate. On the live site, signed in, each star is a production D1 row.

**A new film.** Import below, then Curate. The live site shows it after a Pages deploy they ask for. Do not re-import after they star.

**They are highlighting in Readwise.** That is the source for this watch. The vault step below brings the stars in. Do not ask them to star those same lines in Curate.

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
    "lineIndex": null,
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
- `notes[]` — the room on a line. Shape and Pocket mapping are [line-notes](../line-notes/SKILL.md). `people` on the session are who is in the room.
- `stars[]` — `{ "lineIndex": 0, "text": "" }` they asked to keep. `lineIndex` is the catalog line index (0-based), the same number Curate shows as Line N minus 1.

When they call out a quote, find that line in `content/titles/<title-id>.json` and give them **Line N** plus the text so they can star it in Curate. Append `stars` only after they confirm that line.

## Pocket, after the recording

They record the room on Pocket. The movie in that recording is the clock, and the chatter on a line is a [line note](../line-notes/SKILL.md). Follow that skill. Do not transcribe the audio here. A duration with no transcript only fills `pocket.durationMs`. A span that is them saying to star a moment goes in `stars` as a proposal. Show the line. Wait.

## Readwise, after the watch

Highlighting in Readwise is the source when they say so. Readwise syncs to Obsidian. Do not ask them to star those same lines in Curate, and do not copy the highlights into the session file. Set `highlights` to `"readwise"` on the session.

When they say the vault has the note, match that title only. This does not rewrite the rest of `stars-seed.json` and does not write D1:

```bash
npm run content:vault-title -- --title TITLE_ID --vault "<readwise-dir>"
npm run content:stars-push -- --email dascolin@gmail.com --title TITLE_ID --remote --dry-run
```

**Stop.** Show how many lines would insert. Wait. Then drop `--dry-run`. Use `--merge` when the title already has their stars. Never `--force` a title in `stars-protected.json`. A note under a highlight stays on the seed. It is not a D1 column. `content:queue` rewrites the whole seed. Do not use it for one watch.

## Sync

Curate has Sync. Do not add a player, and do not upload the movie. The movie file is not required. The transcript timings are the clock.

1. They tap **Sync**. The mic stays on.
2. The first matching line is a rough start. The list puts that line at the bottom and the clock runs from when that phrase was heard. Lines just said stay on screen. If they scroll up to mark those, the list stays put and the highlight keeps moving. Scrolling back down follows again. The mic does not stop.
3. If the speech runs on, every 5 seconds the words already heard are checked again. The stretch grows until a long enough line is close. The clock uses when those words were heard, so a late lock catches up. The heard words show only while Sync is still searching.
4. A later matching line near that clock snaps the list forward. **Not this** drops the rough start and keeps listening.
5. **Stop** holds the list. They tap Sync again after a pause, a seek, or a bad lock.

A stills `offsetMs` / `timeScale` can correct a clock that drifts the same way on every lock. Do not record `0.96` on a guess. Do not apply that scale unless they ask.

## Report

Title id, line count, last cue time, session path, and whether the Pocket anchor is still missing. Say the live site does not have the film until they ask to deploy.
