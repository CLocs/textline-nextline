# Textline → Nextline

A quoting game built around movie and TV transcripts. You're shown a line — guess what comes next.

**Core loop:** Read a line from a script → pick (or type) the next line → advance or score out.

**Stack:** Vite + React on Cloudflare Pages; stars, auth, runs, and friends on a Cloudflare Worker + D1. Quote stills live in a private R2 bucket.

---

## Concepts

**Transcript run (primary).** Walk a full transcript from start to finish. Score is how far you get — unless you're in **Fun** mode, where misses don't end the run. Start at line 1; each correct answer reveals the next line. This is the default game.

**Quote challenges (later).** Find a memorable quote, share it, and let a friend guess the next line. Builds on the same transcript + question engine. Directed one-question send already exists; the broader async challenge is on the [roadmap](docs/ROADMAP.md).

---

## Gameplay

### Difficulty (default: Fun)

| Mode | Input | Single-player | Multiplayer wrong answer (rooms, later) |
|------|--------|---------------|------------------------------------------|
| **Fun** (default) | Multiple choice — 1 correct next line + distractors | **Infinite forgiveness** — wrong answer → try again; run ends when the transcript ends | Wrong answers **tracked**; **same player tries again**; no elimination |
| **Medium** | Free text — exact or fuzzy match against transcript | One wrong answer ends the run | A miss **eliminates that player**; remaining players continue |
| **Hard** | Free text with stricter matching / no hints | One wrong answer ends the run | One miss **ends the game for the whole team** |

### Scoring

- **Fun mode:** score = lines completed when you reach the end; wrong attempts tracked but don't end the run.
- **Medium / Hard:** score = highest line index reached before a miss (0 if you miss the first question).
- **Streak** = consecutive correct answers in the current run.
- Personal bests and match history already persist. Leaderboards and rooms are later — [roadmap](docs/ROADMAP.md).

---

## Transcript library

The game does **not** fetch subtitles at play time. It runs on a **curated library of transcripts** in `content/`. Today that includes Tier-1 movies, Simpsons Seasons 4–5, and a hidden sample. More titles come from a Letterboxd likes ∪ 4.5★ queue.

**transcript_maker** (`../transcript_maker`) authors timed JSON (SRT/VTT/`.sub`, or TMDB + OpenSubtitles). Drop exports in `imports/` and run `npm run import:all`. Each playable line has `index`, `text`, and optional `startMs` / `endMs` (quote stills seek to `startMs`). MCQ distractors come from other lines in the same transcript, with a similarity gate so look-alikes are skipped.

Growing the catalog: [content workstream](docs/CONTENT.md). Agent skill: [`.cursor/skills/content-ingest/SKILL.md`](.cursor/skills/content-ingest/SKILL.md).

---

## Documentation

| Doc | What it's for |
|-----|----------------|
| [docs/ROADMAP.md](docs/ROADMAP.md) | Now / next / later — the working plan |
| [docs/SHIPPED.md](docs/SHIPPED.md) | How we got here (phases 1–2.6 and shipped features) |
| [docs/CONTENT.md](docs/CONTENT.md) | Letterboxd queue, convert, import (C0–C4) |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Cloudflare Pages + Worker + D1 + R2 |

Phase writeups used to live in this README; they moved to [docs/SHIPPED.md](docs/SHIPPED.md).

---

## Development

### Setup

```bash
npm install
```

### Play the game

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Sign in (or use **Continue without signing in** in Vite dev), pick a title, read the current line, choose what comes next. Fun mode: wrong answers let you try again until you finish the episode.

### Import transcripts

Export timed JSON from **transcript_maker**, drop files in `imports/`, then:

```bash
npm run import:all
```

Or import one file:

```bash
npm run import -- path/to/export.json
```

This writes normalized titles to `content/titles/<id>.json` and updates `content/catalog.json`.

### Extract stills (local)

Agent skill: [`.cursor/skills/stills-extract/SKILL.md`](.cursor/skills/stills-extract/SKILL.md). Needs **ffmpeg** on PATH. Movie files stay on this PC (`H:\videos\movies`, then `G:\videos\movies`). Catalog Ops → Stills (`#/ops`, with `npm run dev`) shows one status per title:

| Status | Meaning |
| --- | --- |
| ready | File is on disk. The clock has not been checked. |
| synced | Lock frames matched (`syncedAt` in `content/stills-sync.json`). The rest of the lines can be extracted. |
| review | A frame did not match, or stills exist without `syncedAt`. Wait. |
| approved | Two thumbs-up in the studio. |
| batched | Remaining lines are JPEGs on disk. |
| pushed | Those JPEGs are in R2. |

Ask in chat to sync a movie. That check looks at the frames, so it is the skill, not a script. A 23.976 fps file that runs as long as the subtitle stays at no offset. PAL `timeScale: 0.96` is for a ~25 fps rip (Ocean's 13). When the locks match, the row becomes **synced**. When one does not, it stays **review**.

Remux, then extract a handful (gitignored `inbox/media/` + `inbox/stills-preview/`):

```bash
npm run content:stills:remux -- --title oceans-thirteen-2007 --input "G:\videos\movies\Ocean's 13 (2007).avi"
npm run content:stills -- --title oceans-thirteen-2007 --indices 40,58,70,526,768,1334
```

Batch every **synced** title that is not batched yet. This does not upload:

```bash
npm run content:stills:overnight
```

Ask in chat to upload, or push named titles yourself. Skip anything still in review:

```bash
npm run content:stills:push -- --title oceans-thirteen-2007
```

See [Phase 2.6](docs/SHIPPED.md#phase-26--quote-stills-r2-catalog-ops-after-25) and [docs/DEPLOY.md](docs/DEPLOY.md#quote-stills-r2).

### Content queue (Letterboxd)

Drop an official [Letterboxd export](https://letterboxd.com/user/exportdata/) ZIP into `inbox/letterboxd/` (gitignored), then:

```bash
npm run content:queue -- --from inbox/letterboxd/letterboxd-export.zip
```

Writes `content/queue.json` (likes ∪ 4.5★+, merge-safe) and `content/queue.md` (priority, then **diary play count**, then Readwise highlights). Optional vault cross-check:

```bash
npm run content:queue -- --from inbox/letterboxd --vault "C:\Users\dasco\Documents\clocs\Readwise"
```

That also writes `content/readwise-highlights.json` (quotes matched to queue titles) and `content/stars-seed.json` (highlights that already fuzzy-match a line in `content/titles/`). To attach those as **your** cloud stars (D1):

```bash
npm run content:stars-push -- --email you@example.com --remote --dry-run
```

Inserts only titles you don't already have stars for (`ON CONFLICT DO NOTHING`). Skips [`content/stars-protected.json`](content/stars-protected.json) even with `--force`. Never `--force` a title you curated in the app (Wolf, Empire, Ocean's 13, Payback, Inglourious, Batman Begins, Django, The Gentlemen). `--title` limits to one film.

You must already have signed in on the live app once (so a `users` row exists). See [docs/DEPLOY.md](docs/DEPLOY.md) for how star sync works.

### Local movie uploads

```bash
npm run content:uploads -- --dir "G:\videos\movies"
```

Matches files in that folder to catalog movies (split Part1/Part2 encodes count as one title). Writes [`content/uploads.md`](content/uploads.md), `content/uploads.json`, and `content/stills-coverage.json`.

The **Catalog** screen (`#/ops`) is the live table (curated, stars, plays, still %, on-disk media). It is only visible to `dascolin@gmail.com` (and `local@dev` in Vite).

### Quote stills (R2)

Private bucket `textline-stills`, bound as `STILLS` in [`wrangler.toml`](wrangler.toml). The Pages Function at `functions/stills/` serves `/stills/{titleId}/{line}.jpg` (same path Vite uses locally).

One-time: `npx wrangler r2 bucket create textline-stills`

After extracting:

```bash
npm run content:stills:push -- --title oceans-thirteen-2007 --title the-wolf-of-wall-street-2013
```

Then deploy Pages so the Function + binding go live. The GitHub Pages token must include **R2** (Workers Edit template does).

### Test

```bash
npm test
```

### Build

```bash
npm run build
npm run preview
```

### Deploy

Static hosting on **Cloudflare Pages**. Stars/auth need the Worker — see [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
npm run deploy          # local: build + wrangler pages deploy
npm run deploy:api      # Worker + D1 (from repo root; do not skip this after API changes)
```

Push to `main` deploys **both** via GitHub Actions.

Or connect GitHub Actions (push to `main`) with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

### Project layout

```
content/           normalized library (catalog + per-title JSON)
inbox/letterboxd/  gitignored Letterboxd ZIP
inbox/srt/         gitignored raw subtitles
inbox/media/       gitignored movie remuxes (stills)
inbox/stills-preview/  gitignored landmark JPEGs
imports/           raw transcript_maker exports
src/
  app/             React UI (library, play, complete, profile)
  components/
  lib/
    game/          MCQ generator + session state
    runs/          persist completed games + thumbs
    import/        transcript_maker → Title
    content/       load (Node) + browser (Vite bundle)
scripts/import.ts  CLI to ingest exports
scripts/letterboxd-queue.ts  Letterboxd ZIP → content/queue.json
scripts/extract-stills.ts  ffmpeg stills from line startMs
scripts/remux-media.ts  stream-copy movie → inbox/media/{titleId}.mkv
test/
```

---

## Name

**textline-nextline** — you get a *text line*; you guess the *next line*.

Subtitles and stills may be copyrighted; the library is personal/curated (Letterboxd likes ∪ 4.5★, plus titles prepared in transcript_maker). A paid Steam build is a later, separate question — [roadmap](docs/ROADMAP.md#steam) and [content](docs/CONTENT.md).
