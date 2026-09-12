# Prompt: Batch SRT → JSON export for textline-nextline

Copy this into a new Cursor chat in **transcript_maker** (`../transcript_maker`).

---

## Task

Add a **Node CLI script** that batch-processes a folder of `.srt` / `.vtt` files and writes **timed JSON exports** compatible with the sibling game repo **textline-nextline**.

This is the handoff format textline-nextline already imports via `npm run import:all`.

## Context

- **transcript_maker** already parses SRT/VTT, generates clean transcripts (`generateTranscript`), and exports timed JSON in the browser via `workToTimedJson` (`src/lib/export/transcript.ts`).
- **textline-nextline** imports that JSON with `src/lib/import/transcriptMaker.ts` and stores normalized titles in `content/titles/`.
- Today export is manual, one file at a time from the Work screen. We need **batch** for a folder of SRTs — a TV season *or* a stack of movie files from the [content workstream](ROADMAP-content.md).

## Requirements

### CLI

```bash
npm run batch:export -- <input-dir> [--out <output-dir>]
```

- Default output: `../textline-nextline/imports/` (or `./exports/` if sibling path missing).
- Process every `.srt` and `.vtt` in `<input-dir>` (non-recursive is fine for v1; optional `--recursive`).
- Skip files that fail parse; log errors and continue.
- Print summary: N exported, M failed.

### Per file

1. Parse subtitle → cues (reuse `parseSubtitle` from `src/lib/subtitle/`).
2. Generate transcript with **default clean options** (`defaultCleanOptions` from `src/types/index.ts`) — same as clicking "Generate transcript" in the UI.
3. Build a `Work`-shaped object:
   - `title` — from filename, cleaned up. Strip a trailing language tag (`.en`, `.eng`, `.en-US`) before the extension. Prefer **movie** titles as `Name (Year)` when the filename has a year; keep TV episode filenames as show + episode code without the language suffix.
     - `The Simpsons - 4x01 - Kamp Krusty.en.srt` → `The Simpsons - 4x01 - Kamp Krusty`
     - `The.Great.Escape.1963.en.srt` / `The Great Escape (1963).srt` → `The Great Escape (1963)`
   - Optional `film: { title, year }` when a 4-digit year was parsed (textline-nextline already maps `film.year` → `TitleMeta.year`).
   - `sourceFilename` — original filename
   - `cues` — parsed cues
   - `transcript` — generated transcript
4. Write JSON using the same shape as `workToTimedJson` (pretty-printed, trailing newline).

### Implementation notes

- Use **tsx** for the script (already used elsewhere or add devDependency), e.g. `scripts/batch-export.ts`.
- Import existing lib code; do **not** duplicate parse/clean logic.
- Node-only: no browser APIs, no IndexedDB.
- Add Vitest tests with a tiny fixture SRT in `test/fixtures/`.
- Document in README under a "Batch export" section.

### Output contract (must match textline-nextline import)

TV episode:

```json
{
  "title": "The Simpsons - 4x01 - Kamp Krusty",
  "sourceFilename": "The Simpsons - 4x01 - Kamp Krusty.en.srt",
  "cues": [ ... ],
  "transcript": {
    "generatedAt": 1234567890,
    "options": { ... },
    "blocks": [
      { "startMs": 0, "endMs": 1000, "cueIndices": [1], "text": "...", "kind": "dialogue" }
    ]
  }
}
```

Movie (year on `title` and optional `film`):

```json
{
  "title": "The Great Escape (1963)",
  "sourceFilename": "The.Great.Escape.1963.en.srt",
  "film": { "title": "The Great Escape", "year": 1963 },
  "cues": [ ... ],
  "transcript": { "generatedAt": 1234567890, "options": { ... }, "blocks": [ ... ] }
}
```

`film.tmdbId` is optional here (C0 / OpenSubtitles can fill it later). Do not fail export if year cannot be parsed — fall back to a cleaned filename title.

textline-nextline will run:

```bash
cd ../textline-nextline
npm run import:all
```

### Out of scope (for this task)

- Downloading SRTs from OpenSubtitles or tvsubtitles.net
- UI changes in the browser app
- Pushing directly into textline-nextline's `content/` folder (export to `imports/` only)

### Done when

- `npm run batch:export -- ./path/to/srts --out ../textline-nextline/imports` produces JSON files
- textline-nextline `npm run import:all` ingests them without errors
- Tests pass

---

## Why develop this in transcript_maker?

Yes — **develop it in transcript_maker**. That repo owns parse → clean → export. textline-nextline only imports the normalized JSON. Keeping batch export in transcript_maker avoids duplicating subtitle logic and matches the existing handoff workflow.
