# Prompt: Batch SRT → JSON export for textline-nextline

Copy this into a new Cursor chat in **transcript_maker** (`../transcript_maker`).

---

## Task

Add a **Node CLI script** that batch-processes a folder of `.srt` / `.vtt` files and writes **timed JSON exports** compatible with the sibling game repo **textline-nextline**.

This is the handoff format textline-nextline already imports via `npm run import:all`.

## Context

- **transcript_maker** already parses SRT/VTT, generates clean transcripts (`generateTranscript`), and exports timed JSON in the browser via `workToTimedJson` (`src/lib/export/transcript.ts`).
- **textline-nextline** imports that JSON with `src/lib/import/transcriptMaker.ts` and stores normalized titles in `content/titles/`.
- Today export is manual, one file at a time from the Work screen. We need **batch** for a folder of SRTs (e.g. a season of Simpsons subtitles).

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
   - `title` — from filename, cleaned up (e.g. `The Simpsons - 4x01 - Kamp Krusty.en.srt` → `The Simpsons - 4x01 - Kamp Krusty`)
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
