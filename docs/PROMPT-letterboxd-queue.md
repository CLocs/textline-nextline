# Prompt: Letterboxd export → seed queue (C0)

Copy this into a new Cursor chat in **textline-nextline**.

This is **C0** of the [content workstream](ROADMAP-content.md). Do not implement batch SRT convert here — that stays in transcript_maker ([PROMPT-transcript-maker-batch-export.md](PROMPT-transcript-maker-batch-export.md)).

---

## Task

Add a **Node CLI** that turns an official Letterboxd data-export ZIP (or extracted folder) into a **tracked movie queue**: films you liked **or** rated 4.5–5 stars.

textline-nextline will use that queue as the checklist for SRT acquisition and import. The game still does not fetch subtitles at play time.

## Context

- Letterboxd has no public API we will call. Source is the official ZIP from https://letterboxd.com/user/exportdata/ (Settings → Data → Export).
- Typical ZIP layout includes `likes/films.csv` and `ratings.csv`. Both have `Name`, `Year`, `Letterboxd URI`. Ratings also have `Rating` on a 5-star scale (values like `4.5`, `5`).
- There are **no TMDB ids** in the export. Resolve them later by searching TMDB with `Name` + `Year` (transcript_maker’s movie search proxy is the existing path; a local TMDB call from this CLI is fine if documented).
- Seed rule (do not change): **union** of all rows in `likes/films.csv` and rows in `ratings.csv` where `Rating >= 4.5`, **deduped by Letterboxd URI**. Not `watched.csv`.
- Catalog today is Simpsons TV only. This queue is movies.

## Requirements

### CLI

```bash
npm run content:queue -- --from <path-to-zip-or-dir> [--out content/queue.json]
```

- Accept a `.zip` or a directory that already contains the CSVs.
- Default output: `content/queue.json` (committed once we have a real export; until then, keep sample/fixture only).
- Re-running against a newer export **must not** wipe status on titles already in the queue (merge by `letterboxdUri`).
- Print summary: N liked, N high-rated, N unique after union, N new vs previous queue.

### Queue item shape

```json
{
  "title": "The Great Escape",
  "year": 1963,
  "letterboxdUri": "https://boxd.it/29Pq",
  "liked": true,
  "rating": 5,
  "tmdbId": null,
  "srt": "missing",
  "converted": false,
  "imported": false
}
```

- `liked` / `rating` reflect whichever sources contributed (a film can be both).
- `tmdbId` may stay `null` in v1 if you skip TMDB; if you resolve it, match on exact year when possible and leave `null` on ambiguous results (log them).
- `srt`: `missing` | `manual` | `opensubtitles` | `short` (status only — this script does not download SRTs). Markdown shows `[ ] missing`, `[x]`, or `[x] short`.
- Sort the array by `year` then `title` for stable diffs.

### Implementation notes

- Use **tsx** (already used for `scripts/import.ts`), e.g. `scripts/letterboxd-queue.ts`.
- Gitignore Letterboxd ZIPs and an inbox dir (e.g. `inbox/letterboxd/*.zip`, `inbox/srt/`). Do not commit the user’s export.
- Parse CSV robustly (quoted fields, BOM). Add Vitest fixtures: a tiny likes CSV + ratings CSV covering overlap, a 4.0 rating (excluded), a 4.5 (included).
- Document in README (Import transcripts or a short “Content queue” bullet) and point at [ROADMAP-content.md](ROADMAP-content.md).

### Out of scope (for this task)

- Downloading SRTs or calling OpenSubtitles
- Running transcript_maker convert
- Writing into `imports/` or `content/titles/`
- Scraping Letterboxd HTML
- The full watched list

### Done when

- `npm run content:queue -- --from ./path/to/export.zip` writes `content/queue.json`
- Union + dedupe + 4.5 threshold match the seed rule (tests)
- A second run with extra likes only **appends** new rows and preserves existing `srt` / `converted` / `imported` / `tmdbId`
