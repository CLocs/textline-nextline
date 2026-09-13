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
- Optional later: leaderboards per title, daily challenges. Personal bests and match history land in [Phase 2.5](#phase-25--reputation--profile-after-2a).

---

## Transcript library

The game does **not** fetch subtitles at play time. It runs on a **curated library of transcripts** that we build up over time. The catalog today includes **Tier-1 movies**, **Simpsons Seasons 4–5**, and a hidden sample. More titles come from a Letterboxd likes ∪ 4.5★ queue — see the [content workstream](docs/ROADMAP-content.md).

### Authoring: transcript_maker

**transcript_maker** is a sibling companion project for creating and cleaning transcripts (local path: `../transcript_maker`).

- Import SRT/VTT/SubViewer (`.sub`) or find a film via TMDB + OpenSubtitles (local proxy).
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

**Later:** Admin ingest script (drop JSON in a folder → validate → publish), and a growing catalog as new titles are transcribed ([content workstream](docs/ROADMAP-content.md)). Show/season/episode metadata and Movies \| TV library browse are already in use.

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

## Phase 1.8 — Library browse UX

**Goal:** Once the catalog mixes movies and multi-season TV, a flat title list is too noisy. Browse by kind, then drill into shows.

### Features

- [x] **Episode meta on import** — parse `Show - 5x01 - Name` into `meta.show` / `season` / `episode`
- [x] **Grouped library** — Movies list + TV Shows → season → episode (`libraryGroups` + `LibraryScreen`)

Home rails (“your recent” + top played) live on the signed-in **Home** landing in [Phase 2.5](#phase-25--reputation--profile-after-2a); **Browse full library** uses this grouping.

---

## Phase 2 — Multiplayer

**Goal:** 2–4 players take turns guessing the next line in the same transcript run. Prefer **logged-in** players once Phase 2a ships (display name from account).

### Phase 2a — Auth + share mini-game *(before rooms)* ✅

Shipped on main (PR #5). PR #6 followed with safer per-title star push and MCQ prompt lead-in.

- [x] **Magic-link login** — email link via Resend; session on Worker + D1
- [x] **Login gate** — browse/play requires sign-in
- [x] **Editable display name** — `PATCH /api/auth/me` from the auth bar
- [x] **Claim anonymous stars** — map browser `playerId` → user on first sign-in
- [x] **Share mini-game link** — `#/play/:shareId`; recipient must sign in
- [x] **Attribution / scores** — `shared_runs` leaderboard per share

### Phase 2a.1 — Local auth polish

- [x] **Origin-aware magic links** — email link uses the request `Origin` when it is in `ALLOWED_ORIGINS` (so localhost gets a localhost link). **Redeploy the Worker** for this to apply against the production API.
- [x] **Vite-only continue** — “Continue without signing in (local only)” on the login screen in `npm run dev`

### Features (rooms — later)

- [ ] **Room / session**
  - Host creates a game (pick title, player count 2–4)
  - Share join link or short room code
  - Players use account display name (or enter a display name if guest policy allows)

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

- **Reconnect:** Session token from Phase 2a auth?

---

## Phase 2.5 — Reputation & profile *(after 2a)* ✅

**Goal:** Gamify without waiting on rooms or global leaderboards. Every completed run is recorded. Signed-in players get a tabbed profile (account, match history, game stats). **Home** is the landing (recent + top played); the full catalog is one click away under Browse. End-of-run thumbs collect a light quality signal for later popular-star ranking.

Auth already exists (Phase 2a). Solo `GameRun` used to be **client-only** — the only persisted scores were `shared_runs` on a share link. Crowd popular remains a raw `COUNT` of stars per line (thumbs are stored, not yet applied).

### Features

- [x] **Persist runs** — on complete (finished or miss), write a row to D1 for the signed-in user. Include full-episode and mini-game, plus shared mini-games (keep `shared_runs` for the share leaderboard; also log a personal `runs` row so history is one table).
- [x] **Profile** — auth bar name opens a profile with tabs: **Account** (display name), **Match history**, **Game stats** (games played, lines guessed, titles touched, personal most-played). Reputation is those totals — not ELO.
- [x] **Match history** — list on the profile: **game** (full vs mini, mode), **title** (movie or show + episode), **score** (`correct / questions`, plus wrongs/skips), and stored thumbs when present. Mini runs with a saved prompt list can **Share** an exact replay (`#/play/:shareId`); a short cohort line shows who played. Newest first. Personal; not a public leaderboard.
- [x] **Home + library** — signed-in landing is **Home**: **your recent**, **top played movies**, **top played shows** (TV grouped by show). **Browse full library** opens Movies \| TV. Global play counts; recent from personal runs. Rails hide until plays exist.
- [x] **Thumbs on complete** — optional thumbs up / down on the game-over screen (skip allowed). One rating per run, changeable until they leave. Stars stay “this line is a TL”; thumbs are “this session was a good game.”
- [ ] **Light weight on popular *(later slice)*** — do **not** change `/api/stars/popular` in the same ship as collecting votes. When enough ratings exist, apply a small title-level nudge (clamp about ±10%) so well-liked titles’ crowd stars surface a bit sooner. Never hide or unstar a line from a thumbs-down.

### Data (D1)

New `runs` table, keyed by run id (many games per user + title):

| Column | Notes |
|--------|--------|
| `id` | UUID |
| `user_id` | Signed-in player |
| `title_id` | Catalog id |
| `length` | `full` \| `mini` |
| `mode` | `fun` \| `medium` \| `hard` |
| `correct_count`, `wrong_count`, `skip_count` | Same as today’s complete screen |
| `question_total` | Denormalize so history does not need the catalog |
| `end_reason` | `finished` \| `miss` |
| `share_id` | Nullable; set when the run was (or became) a shared mini-game |
| `question_queue` | JSON array of prompt line indices for mini-games; required to share an exact replay |
| `completed_at` | ISO timestamp |

New `run_ratings` (or `thumb` on `runs`): `up` \| `down`, `rated_at`. Unique on `run_id`.

Indexes: `(user_id, completed_at DESC)` for history; `(title_id)` for top-played; optional `(user_id, title_id)` for personal bests.

**Reputation (v1):** derived, not a stored ELO. Example: rank from total `correct_count` (and maybe games finished). Enough to feel like progress; competitive ladders stay Phase 4.

**Top played:** `COUNT(*)` of runs per `title_id`, then group TV with existing show metadata (`libraryGroups`). Movies stay per title.

### Later popular formula *(not v1)*

Keep star **count** as the primary sort. Then a small multiplier from net thumbs on that title:

```
popular_score ≈ star_count × (1 + ε × title_sentiment)
```

`title_sentiment` is mean of run thumbs on that title (up = +1, down = −1), `ε ≈ 0.1`, clamp the factor to roughly `0.9–1.1`. Optional extra: slightly down-weight a player’s stars on a title they thumbs-downed. Thumbs never dominate a 3-star vs 1-star gap.

### Out of scope for 2.5

- Public / friends leaderboards (Phase 4)
- Rooms / realtime (Phase 2)
- Changing what a **star** means
- Requiring a thumb to leave the complete screen
- Anonymous run log (play already requires sign-in)

### Done when

- Finishing (or missing out of) a solo or shared game writes a `runs` row.
- Profile shows stats + a match-history list (game, title, score, thumbs when present).
- Home lists your recent titles plus top played movies/shows; Browse opens the full catalog.
- Complete screen has optional thumbs; ratings persist; popular ranking is **unchanged** until the later weight slice.
- Mini-game history rows with a saved prompt list can share an exact replay; Setup share still uses live stars.

### Suggested build order

1. `runs` migration + `POST /api/runs` from `CompleteScreen` (auth session).
2. `GET /api/runs/mine` → profile match history + derived stats / rank.
3. `GET /api/stats/played` → library rails (global counts, grouped with `libraryGroups`).
4. Optional thumbs on complete → `run_ratings`.
5. After real vote volume: weighted popular as a follow-up PR with a feature flag.

### Exact replay from match history

Setup **Share mini-game** still means “play my **current** stars” (queue is rebuilt + shuffled each time). Sharing a **finished mini-game** from history freezes that run’s prompt line indices in order. Friends play the same 10 setups; MCQ distractors may still shuffle. Full-episode rows have no Share. Runs completed before queues were persisted cannot be shared exactly.

---

## Spike: curated / saved mini-game packs *(not building)*

Named playlists of quotes (pick 10 lines, save, replay, share) is a different product from **stars** (personal TL seed) and from **frozen run-replays** (the accident of one play). A history Share is the cheap prototype of “a really good 10.” Use that in the wild before building an editor.

Open questions (spike only — no pack UI):

- Title-scoped vs mixed-title packs
- Order: curated sequence vs shuffle-on-play
- Edit after someone has already played the pack
- How this relates to stars / thumbs / crowd popular
- Curate UI: pick from transcript vs “save this run as a pack”

---

## Phase 3+ — Social & polish *(backlog)*

- [ ] **Quote challenges (Concept 2)** — share a single line + guess link
- [ ] **Difficulty modes** — Medium/Hard free text
- [ ] **Leaderboards** — per title, global, friends (builds on the Phase 2.5 run log)
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

1. **Vault scrape (local CLI)** — ✅ Readwise Obsidian folder (`--vault` on `content:queue`): extract `## Highlights`, match notes to the Letterboxd queue by title+year, write `content/readwise-highlights.json`.
2. **Match to transcript** — Partial: fuzzy map highlight text → `(titleId, lineIndex)` into `content/stars-seed.json` when that title is already in `content/titles/`. Manual review still needed for misses.
3. **Weighted seed into stars** — Not yet: applying `stars-seed.json` to D1 / the Curate UI.
4. **Watch parties (metadata)** — Store “session: title + people present” from Obsidian; associate TLs with that group.
5. **Login + group popularity** — Real accounts (or stable invite tokens); stars scoped to a pair / triple / group. “Most popular TLs among us” = intersection or ranked aggregation over that set — same D1 pattern as today’s crowd `popular`, with a `group_id` filter.

**Wildness rating:** ~6/10 on product ambition, ~4/10 on technical risk. Scrape + fuzzy match is ordinary NLP plumbing; co-watcher inference is messy data (inconsistent notes), not hard code. Login + group popularity is the real phase gate — but we’ve already proven anonymous `playerId` + D1 aggregation; accounts just make identity durable across devices.

**Open questions:** Obsidian highlight format (core vs plugins); how titles are named in the vault vs `content/catalog.json`; privacy (vault stays local — only matched TLs leave the machine). Line **stars** stay curation; session **thumbs** (Phase 2.5) are a separate, lighter reaction for ranking — not a second star.

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
| **1.7 — Admin / Curate** | Bulk star from transcript UI | ✅ Faster personal TL curation without playing through |
| **1.8 — Library browse UX** | Movies \| TV → season → episode | ✅ Grouped picker via `meta` + `libraryGroups` |
| **2a — Auth + share mini-game** | Magic-link login, claim stars, share link | ✅ Durable accounts; friends play your starred mini-game |
| **2a.1 — Local auth polish** | Origin-aware magic links; Vite continue | ✅ Code in; Worker redeploy for email links on localhost |
| **2.5 — Reputation & profile** | Persist runs, profile, match history, library rails, thumbs, exact mini replay | ✅ Games tracked; history Share freezes the 10 prompts |
| **2 — Multiplayer** | Rooms, codes/links, turn rotation, sync | 2–4 friends can play one transcript together |
| **3 — Social** | Quote sharing, async challenges | Send a line to a friend without a full room |
| **3.5 — Obsidian → TL** | Vault scrape, highlight→line match, weighted seed | Personal TLs from Obsidian feed mini-games / challenges |
| **3.6 — Online quotes spike** | Time-boxed pull from IMDb/Wikiquote/etc. → match hit-rate | Learn if external quotes are worth a real pipeline |
| **4 — Depth** | Free-text modes, leaderboards, daily challenge | Replayability and competition |
| **4.5 — Group TLs** | Login (or durable identity) + pair/triple/group popularity | “Our” most-liked TLs among a watching set |

App phases above do **not** wait on new titles. Library growth is a [parallel content workstream](docs/ROADMAP-content.md) (C0–C4):

| Phase | Focus | Target outcome |
|-------|--------|----------------|
| **C0 — Seed queue** | Letterboxd ZIP → likes ∪ 4.5★ queue | ✅ Queue + Readwise highlights / stars-seed |
| **C1 — Batch convert** | SRT/VTT/`.sub` folder → timed JSON in transcript_maker | ✅ Batch export; SubViewer (`.sub`) supported |
| **C1.5 — SubViewer (.sub)** | Parse SubViewer 2.0 + `[br]` in transcript_maker | ✅ Simpsons S5 imported via `.sub` |
| **C2 — SRT acquisition** | Manual drop + optional paced OpenSubtitles | Inbox drop works; OpenSubtitles still optional |
| **C3 — Import + hygiene** | `import:all` + year/tmdbId + clean titles | 🔄 Movies + S4/S5 playable; `.en` tails / TMDB ids still open |
| **C4 — Ongoing** | Re-export Letterboxd, convert the delta | New likes / 4.5★ films without a full rebuild |

### Suggested build order (Phase 0 → 1)

1. **Content schema** — `Title`, `Line` (index, text, optional `startMs`/`endMs`); align with transcript_maker `TranscriptBlock`.
2. **Import script** — `transcript_maker` timed JSON → normalized lines in content store (folder or DB).
3. **Seed library** — Manually export 3–5 episodes from transcript_maker; run import; commit content.
4. **MCQ generator** — Given `lineIndex`, return correct `lineIndex + 1` + N distractors from same transcript.
5. **Game API** — `startRun(titleId)`, `submitAnswer(runId, choiceId)` → correct/incorrect + next question or final score.
6. **Web UI** — Pick title → play → game over.

### Growing the library over time

Catalog already has **movies + Simpsons S4/S5**. More titles come from **movies you liked most** (Letterboxd likes ∪ 4.5–5★), not every film. Details and phases: [docs/ROADMAP-content.md](docs/ROADMAP-content.md). Agent skill: [`.cursor/skills/content-ingest/SKILL.md`](.cursor/skills/content-ingest/SKILL.md).

| When | How |
|------|-----|
| **Now** | Movies + Simpsons S4/S5 in `content/`. Convert SRT/VTT/`.sub` via transcript_maker → `imports/` → `npm run import:all` |
| **C0** | ✅ Official Letterboxd export ZIP → seed queue ([prompt](docs/PROMPT-letterboxd-queue.md)) |
| **C1 / C1.5** | ✅ Batch SRT/VTT/`.sub` → timed JSON in transcript_maker ([prompt](docs/PROMPT-transcript-maker-batch-export.md)) |
| **C2** | Drop subtitles by hand, or pull via OpenSubtitles (existing transcript_maker proxy, daily cap) |
| **C3** | Hygiene: strip leftover `.en` from S4 titles/ids without breaking star `titleId`s; persist TMDB ids |
| **Ongoing** | Re-export Letterboxd, convert the delta, spot-check, import |
| **Later** | Admin page or CLI: upload JSON, preview lines, publish |

### Suggested build order (Phase 2)

1. **Room model** — `Room`, `Player` (name, sessionToken), `RoomState` (current line, active player).
2. **Join flow** — Create room → code/link → join with name.
3. **Turn engine** — Advance active player index; apply same MCQ rules as single-player.
4. **Realtime layer** — Broadcast state changes to all clients in room.
5. **Lobby & game over** — Waiting room, turn indicator, final standings.

### Suggested build order (Phase 2.5)

Does **not** wait on rooms. Auth (2a) is the only gate. Full spec: [Phase 2.5](#phase-25--reputation--profile-after-2a).

1. Persist completed runs to D1.
2. Profile + match history.
3. Home rails (your recent + top played) — reuse Phase 1.8 `libraryGroups`; Browse for full catalog.
4. Thumbs on complete; weight popular stars only after votes exist.

### Recent feedback (parked)

- **Visual palette** — Coolors palette1 → palette2 (plum/mint/lime) on the content branch; logo artwork later.
- **Localhost magic links** — Origin-aware links are coded (2a.1); **redeploy Worker** so production API emails point at localhost when you develop there.
- **Library home / top played** — ✅ Home landing (recent + top played) + Browse full library.
- **S4 `.en` title suffixes** — optional hygiene; don’t rewrite ids carelessly (stars key on `titleId`).

---

## Technical notes *(to be decided)*

- **Stack:** TypeScript + Vitest for content/import (Phase 0); Next.js (or similar) for the game UI in Phase 1.
- **Transcript source:** Curated exports from **transcript_maker** — not runtime subtitle APIs for MVP.
- **Content storage:** Git-tracked JSON for early episodes is fine; move to DB or object storage when the catalog grows.
- **Legal:** Subtitles/transcripts may be subject to copyright; library is personal/curated (Letterboxd likes ∪ 4.5★, plus titles you already prepared in transcript_maker). See [docs/ROADMAP-content.md](docs/ROADMAP-content.md).

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
npm run content:stars-push -- --email you@example.com --remote --title Payback
```

Inserts only titles you don't already have stars for (Curate unstars are kept). `--title` limits to one film; `--force` re-seeds a title you already started.

You must already have signed in on the live app once (so a `users` row exists). See [docs/DEPLOY.md](docs/DEPLOY.md) for how star sync works.

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
inbox/letterboxd/  gitignored Letterboxd ZIP
inbox/srt/         gitignored raw subtitles
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
test/
```

---

## Name

**textline-nextline** — you get a *text line*; you guess the *next line*.
