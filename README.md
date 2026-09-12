# Textline → Nextline

A quoting game built around movie and TV transcripts. You're shown a line — guess what comes next.

**Core loop:** Read a line from a script → pick (or type) the next line → advance or score out.

---

## Concepts

### Concept 1: Transcript run (primary)

Walk through a full transcript from start to finish. Your score is how far you get — unless you're in **Fun** mode, where misses don't end the run.

- Start at line 1.
- Each correct answer reveals the next line and presents the following one as the next question.
- **Fun mode:** infinite forgiveness — a wrong answer lets you try again on the same question.
- **Medium / Hard:** one wrong answer ends the run; final score = number of consecutive correct lines.

This is the default game mode and the focus of Phase 1.

### Concept 2: Quote challenges (later)

Find a memorable quote, share it with friends, and let them guess the next line.

- Search or browse transcripts for a good setup line.
- Send a link (or code) to a one-off challenge.
- Friend plays the single question (or a short streak) without needing the full run context.

Useful for async play and social sharing; builds on the same transcript + question engine from Concept 1.

---

## Gameplay

### Difficulty (default: Fun)

| Mode | Input | Single-player (Phase 1) | Multiplayer wrong answer (Phase 2) |
|------|--------|-------------------------|-------------------------------------|
| **Fun** (default) | Multiple choice — 1 correct next line + distractors | **Infinite forgiveness** — wrong answer → try again; run ends when the transcript ends | Wrong answers **tracked** (right/wrong per player); **same player tries again**; no elimination |
| **Medium** | Free text — exact or fuzzy match against transcript | One wrong answer ends the run | A miss **eliminates that player**; remaining players continue |
| **Hard** | Free text with stricter matching / no hints | One wrong answer ends the run | One miss **ends the game for the whole team** |

### Scoring (Concept 1)

- **Fun mode:** score = lines completed when you reach the end of the transcript; wrong attempts tracked but don't end the run.
- **Medium / Hard:** score = highest line index reached before a miss (0 if you miss the first question).
- **Streak** = consecutive correct answers in the current run.
- Optional later: leaderboards per title, daily challenges, personal bests.

---

## Transcript library

The game does **not** fetch subtitles at play time. It runs on a **curated library of transcripts** that we build up over time — starting with a handful of episodes, then adding more as they're ready.

### Authoring: transcript_maker

**transcript_maker** is a sibling companion project for creating and cleaning transcripts (local path: `../transcript_maker`).

- Import SRT/VTT or find a film via TMDB + OpenSubtitles (local proxy).
- Generate a readable transcript (merge continuations, strip tags, optional SDH).
- Export **timed JSON** (`workToTimedJson`) — title, cues, and `transcript.blocks` with text and timing.

That export is the handoff format into this game's content store.

### Content backend (lightweight)

A small **content layer** (not a full app backend) holds transcripts the game can serve:

```
transcript_maker → export JSON → content store → game API / static bundle
```

| Piece | Role |
|-------|------|
| **Authoring** | transcript_maker in the browser — one-off or batch prep |
| **Content store** | Versioned files or DB table: metadata + ordered lines (from `TranscriptBlock[]`) |
| **Game** | Read-only: list titles, load lines by index, generate MCQ distractors |

**MVP:** Check in a few episode JSON files (or seed a DB from them). No runtime subtitle search.

**Later:** Admin ingest script (drop JSON in a folder → validate → publish), optional metadata (show, season, episode), and a growing catalog as new episodes are transcribed.

### Line model for the game

Each playable **line** maps from a transcript_maker `TranscriptBlock`:

- `index` — 0-based order in the episode (this is the score / progress unit)
- `text` — block text (speaker dashes stripped, same as Markdown export)
- `startMs` / `endMs` — optional; useful later for clips or quote challenges

Distractors for multiple choice come from **other lines in the same transcript** (prefer nearby lines) so wrong answers feel plausible.

---

## Phase 1 — Single-player (MVP)

**Goal:** One player can search a title, play through a transcript, and get a score when they miss.

### Features

- [x] **Transcript library (seed content)**
  - Import 3–5 episodes from transcript_maker JSON exports
  - Store as versioned content (files in repo or DB seeded once)
  - Metadata: title, show/season/episode if applicable, line count

- [x] **Pick a title**
  - Browse or search the curated library (no live SRT fetch)

- [x] **Game session (single player)**
  - Show the current line
  - Present multiple choice for the **next** line (Fun mode)
  - Correct → advance to next line, repeat
  - Wrong (Fun) → try again on the same question
  - Wrong (Medium/Hard) → end run, display score

- [x] **Minimal UI**
  - Search / pick a title
  - Play screen (current line, choices, progress)
  - Game over screen (score, option to restart same title)

### Out of scope for Phase 1

- Accounts / logins
- Multiplayer
- Quote sharing (Concept 2)
- Medium/Hard free-text modes (Fun / MCQ only for Phase 1)
- Leaderboards
- Runtime subtitle search or OpenSubtitles integration

### Phase 1 success criteria

- At least a few episodes are playable from the curated library.
- User picks a title and plays through the transcript (Fun mode: until the end; Medium/Hard: until one miss).
- Score reflects how many lines they got right.
- New episodes can be added by exporting from transcript_maker and dropping into the content store.

---

## Phase 2 — Multiplayer

**Goal:** 2–4 players take turns guessing the next line in the same transcript run, with no accounts — join via link or room code + display name.

### Features

- [ ] **Room / session**
  - Host creates a game (pick title, player count 2–4)
  - Share join link or short room code
  - Players enter a display name only (no login)

- [ ] **Turn rotation**
  - On each question, one player is "on the clock"
  - Correct → next player's turn, advance line
  - Wrong → handled by difficulty (see table above):
    - **Fun:** increment wrong count; **same player tries again** (infinite forgiveness)
    - **Medium:** that player is eliminated; others keep going
    - **Hard:** entire room ends immediately

- [ ] **Shared state**
  - All players see the same current line and whose turn it is
  - Real-time sync (WebSocket or similar)
  - MCQ options generated once per turn; everyone sees identical choices

- [ ] **End game**
  - **Fun:** standings by correct / incorrect counts (and lines advanced)
  - **Medium:** last player standing, or highest score among survivors
  - **Hard:** team score = lines completed before the single miss

### Open design questions (Phase 2)

- **Reconnect:** Anonymous name + session token in local storage?

---

## Phase 3+ — Social & polish *(backlog)*

- [ ] **Quote challenges (Concept 2)** — share a single line + guess link
- [ ] **Difficulty modes** — Medium/Hard free text
- [ ] **Leaderboards** — per title, global, friends
- [ ] **More sources** — beyond SRT (official scripts, fan transcripts) with licensing notes
- [ ] **Mobile-friendly PWA**
- [ ] **Daily challenge** — same title + start line for everyone
- [ ] **Obsidian → TL pipeline** — see [Concept 3](#concept-3-obsidian--tls-textlines-backlog) below
- [ ] **Online quote sources spike** — see [Spike: online quotes](#spike-online-quotes-eg-imdb-research) below

### Concept 3: Obsidian → TLs (Textlines) *(backlog)*

**Idea:** Treat Obsidian as a personal quote mine for **TLs** (memorable lines / setups from TLNL). Import and rank them into the game, then layer social context (who watched with whom, who likes which TL).

| Source in Obsidian | Signal | Suggested star weight |
|--------------------|--------|------------------------|
| Manually copied quotes | Strong curation | Highest (seed personal + crowd boost) |
| Highlighted spans in a transcript note | Intentional “this mattered” | High |
| Fuzzy match of quote text → `content/` line index | Linking vault → game | Required for playable TLs |
| Frontmatter / tags / “watched with …” | Co-watchers | Social graph input |

**Build slices (doable in order):**

1. **Vault scrape (local CLI)** — Walk MD files; extract quotes, highlights, optional `watchedWith` / person tags. Output a seed JSON (`titleId` + candidates).
2. **Match to transcript** — Exact / fuzzy map quote text → `(titleId, lineIndex)`. Manual review UI for ambiguous matches (reuse Curate / Admin).
3. **Weighted seed into stars** — Import as your stars (or a `tl_weight` column) so mini-games prefer vault TLs over random.
4. **Watch parties (metadata)** — Store “session: title + people present” from Obsidian; associate TLs with that group.
5. **Login + group popularity** — Real accounts (or stable invite tokens); stars scoped to a pair / triple / group. “Most popular TLs among us” = intersection or ranked aggregation over that set — same D1 pattern as today’s crowd `popular`, with a `group_id` filter.

**Wildness rating:** ~6/10 on product ambition, ~4/10 on technical risk. Scrape + fuzzy match is ordinary NLP plumbing; co-watcher inference is messy data (inconsistent notes), not hard code. Login + group popularity is the real phase gate — but we’ve already proven anonymous `playerId` + D1 aggregation; accounts just make identity durable across devices.

**Open questions:** Obsidian highlight format (core vs plugins); how titles are named in the vault vs `content/catalog.json`; privacy (vault stays local — only matched TLs leave the machine); whether “likes” are stars or a separate reaction.

### Spike: online quotes (e.g. IMDb) *(research)*

**Idea:** Seed TLs from public quote pages (IMDb Quotes, Wikiquote, fan wikis, etc.) for titles we already have in `content/`, then fuzzy-match into `(titleId, lineIndex)` — same match step as Obsidian imports.

**Why it might be hard:**

| Risk | Notes |
|------|--------|
| **ToS / scraping** | IMDb and similar sites generally disallow automated scraping; no friendly public quotes API for bulk use |
| **Fragile HTML** | Selectors break; rate limits / bot detection |
| **Quote ≠ transcript** | Online quotes are often cleaned, paraphrased, or misattributed — match rate to SRT lines may be low |
| **Episode grain** | Movie quotes map cleaner than TV (which episode?) |
| **Licensing** | Re-shipping scraped quote corpora in the product may be riskier than personal Obsidian notes |

**Spike goal (time-box):** For 1–2 titles already in the library, manually or semi-automatically pull a small quote list → match against our lines → report hit rate and effort. Decide go / no-go before building a pipeline. Prefer sources with clearer reuse terms if any exist; treat IMDb as “interesting target,” not a committed dependency.

**Fits with:** Obsidian → TL match pipeline (reuse fuzzy match + Curate review). Online sources are an alternate *input*, not a separate game feature.

---

## Roadmap

| Phase | Focus | Target outcome |
|-------|--------|----------------|
| **0 — Foundation** | Repo, stack choice, content schema, import path from transcript_maker JSON | ✅ Import script + content store; query lines by index |
| **0.5 — Content seed** | Export 3–5 episodes via transcript_maker; validate + check in | Enough variety to dogfood the game |
| **1 — Single-player MVP** | Title picker, MCQ game loop, score | ✅ Playable solo run on curated episodes |
| **1.5 — Content & UX** | Stars, mini-games, deploy | ✅ Stars + mini-game; static deploy on Cloudflare Pages |
| **1.6 — Star sync** | Worker + D1, star/unstar API, client sync | ✅ Stars persist across devices; crowd-popular feeds mini-games |
| **1.7 — Admin / Curate** | Bulk star from transcript UI | Faster personal TL curation without playing through |
| **2 — Multiplayer** | Rooms, codes/links, turn rotation, sync | 2–4 friends can play one transcript together |
| **3 — Social** | Quote sharing, async challenges | Send a line to a friend without a full room |
| **3.5 — Obsidian → TL** | Vault scrape, highlight→line match, weighted seed | Personal TLs from Obsidian feed mini-games / challenges |
| **3.6 — Online quotes spike** | Time-boxed pull from IMDb/Wikiquote/etc. → match hit-rate | Learn if external quotes are worth a real pipeline |
| **4 — Depth** | Free-text modes, leaderboards, daily challenge | Replayability and competition |
| **4.5 — Group TLs** | Login (or durable identity) + pair/triple/group popularity | “Our” most-liked TLs among a watching set |

### Suggested build order (Phase 0 → 1)

1. **Content schema** — `Title`, `Line` (index, text, optional `startMs`/`endMs`); align with transcript_maker `TranscriptBlock`.
2. **Import script** — `transcript_maker` timed JSON → normalized lines in content store (folder or DB).
3. **Seed library** — Manually export 3–5 episodes from transcript_maker; run import; commit content.
4. **MCQ generator** — Given `lineIndex`, return correct `lineIndex + 1` + N distractors from same transcript.
5. **Game API** — `startRun(titleId)`, `submitAnswer(runId, choiceId)` → correct/incorrect + next question or final score.
6. **Web UI** — Pick title → play → game over.

### Growing the library over time

| When | How |
|------|-----|
| **Now (MVP)** | Pick a few favorite episodes → transcript_maker → export JSON → import into repo |
| **Ongoing** | Same flow whenever you finish a new episode; bump a version or changelog if needed |
| **Later** | Simple admin page or CLI: upload JSON, preview lines, publish to content store |
| **Optional** | Shared types package or JSON schema between transcript_maker and textline-nextline |

### Suggested build order (Phase 2)

1. **Room model** — `Room`, `Player` (name, sessionToken), `RoomState` (current line, active player).
2. **Join flow** — Create room → code/link → join with name.
3. **Turn engine** — Advance active player index; apply same MCQ rules as single-player.
4. **Realtime layer** — Broadcast state changes to all clients in room.
5. **Lobby & game over** — Waiting room, turn indicator, final standings.

---

## Technical notes *(to be decided)*

- **Stack:** TypeScript + Vitest for content/import (Phase 0); Next.js (or similar) for the game UI in Phase 1.
- **Transcript source:** Curated exports from **transcript_maker** — not runtime subtitle APIs for MVP.
- **Content storage:** Git-tracked JSON for early episodes is fine; move to DB or object storage when the catalog grows.
- **Legal:** Subtitles/transcripts may be subject to copyright; library is personal/curated content you already prepared in transcript_maker.

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

Open the URL Vite prints (usually `http://localhost:5173`). Pick an episode, read the current line, choose what comes next. Fun mode: wrong answers let you try again until you finish the episode.

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

Static hosting on **Cloudflare Pages** — no backend required. See [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
npm run deploy          # local: build + wrangler pages deploy
```

Or connect GitHub Actions (push to `main`) with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

### Project layout

```
content/           normalized library (catalog + per-title JSON)
imports/           raw transcript_maker exports
src/
  app/             React UI (library, play, complete)
  components/
  lib/
    game/          MCQ generator + session state
    import/        transcript_maker → Title
    content/       load (Node) + browser (Vite bundle)
scripts/import.ts  CLI to ingest exports
test/
```

---

## Name

**textline-nextline** — you get a *text line*; you guess the *next line*.
