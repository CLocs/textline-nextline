# Standalone quotes — build plan

Mark a line that lands **on its own**, not as a textline → nextline setup. A star means “quiz the line after this one”; plenty of lines are quotable with nothing usable behind them. This plan is the input side (a third mark on a line) and the first output surface (a no-guess **quote of the day**).

Roadmap entry: **Standalone quotes** in the main [README](../README.md). The daily HTML mail and cron do not exist yet, so the mail card is **not** in this plan — the picker it will call is.

---

## Decisions

Four things to settle before any code, because each one is expensive to undo.

### 1. Own table, not a flag on `stars`

A `quote` flag on `stars` is the small diff and the wrong one. Every one of these reads `stars` and treats **any row as a star**:

| Reader | What it would get wrong |
|--------|--------------------------|
| [`fetchPopularStars`](../api/src/stars.ts), `fetchPopularStarsGlobal` | `COUNT(*)` per line — quote marks inflate crowd popular |
| `fetchLovedStarsGlobal` | line-of-the-day pool |
| `fetchMyStars` | feeds `mergeRemoteStars` → the local store → every client reader |
| [`api/src/shares.ts`](../api/src/shares.ts) (lines 81, 145) | star count on share meta, and the **frozen mini-game queue** |
| [`api/src/ops.ts`](../api/src/ops.ts) | owner Catalog star column |
| [`claimAnonymousStars`](../api/src/auth.ts) | copies rows on first sign-in |
| [`scripts/stars-push.ts`](../scripts/stars-push.ts), [`src/lib/content/starsPush.ts`](../src/lib/content/starsPush.ts) | “title already has live stars” skip guard |
| [`scripts/extract-stills.ts`](../scripts/extract-stills.ts), [`src/lib/content/stillsD1.ts`](../src/lib/content/stillsD1.ts) | which frames get extracted |
| Client: `SetupScreen` mini count, `App.beginGame`, `CurateScreen` counts, `dailyLoad` pools, `globalSearch` “Starred by me” | queue contents and labels |

The flag needs a companion `starred` column plus a `WHERE starred = 1` in all of them, and one miss silently drops a dead-end line into a mini-game or inflates a crowd count. A separate table changes **zero** existing star reads.

```sql
CREATE TABLE IF NOT EXISTS line_quotes (
  title_id   TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  player_id  TEXT NOT NULL,
  quoted_at  TEXT NOT NULL,
  PRIMARY KEY (title_id, line_index, player_id)
);
CREATE INDEX IF NOT EXISTS idx_line_quotes_title ON line_quotes (title_id);
```

Same shape and same key as `stars`, so everything we already know about star sync transfers.

### 2. A quote can sit where a star cannot

`CurateScreen` lists [`getValidPromptIndices`](../src/lib/game/miniGame.ts) — playable lines that **have a playable next line**. The last line of a film and any line followed only by SDH are therefore invisible today, and those are exactly the lines this feature is for. Curate needs an **All lines** pool (`getPlayableLines`) where star and love are disabled and quote is not.

### 3. Three marks, three fixed slots

The row must not grow a fourth button-shaped thing. Today each Curate row is `[pack checkbox] [★] [♥] … copy … [send]`, and the heart already renders as a disabled 2.25rem placeholder when the line isn’t starred, so the row width is already fixed. Keep that trick and make it a three-slot cluster:

| Slot | Mark | Off | On | Gate |
|------|------|-----|----|------|
| 1 | **Star** | `☆` outline | `★` lime (`--star-*`) | none |
| 2 | **Love** | `♡` at 35% opacity, disabled | `♥` plum | requires a star (unchanged, cap 5) |
| 3 | **Quote** | outline quotation mark | filled, sage/mint tint | none — independent of star |

Three slots, always the same width, no layout jump when a mark turns on. Each mark gets its own hue so a row with all three doesn’t read as one blob, and `.curate-item.quoted` tints the row’s left edge instead of washing the background (star and love already own the background).

Use an **inline SVG** for the quote mark, like the existing send icon — `❝` / `“` render at wildly different weights across platforms, and the glyph has to sit next to two text glyphs that are already optically mismatched.

Rejected: hiding unset marks behind hover or an overflow menu. Cleaner at rest on desktop, but it costs a tap on touch and buries the primary curation action to save one square.

### 4. The daily quote is not a fourth question

`DAILY_SIZE`, `rotateCards`, `DailyPlayScreen`, and the streak write all assume three **playable** cards. A standalone quote has nothing to guess and may have no next line at all. Pick it with its own function and return it **beside** the three cards, never inside the array. The day streak stays “finished the three questions.”

---

## API

New `api/src/quotes.ts`, mirroring `stars.ts` and reusing `parseStarBody` and `resolveStarPlayerId` (so anonymous `playerId` and signed-in sessions both work, same as stars):

| Route | Body / query | Notes |
|-------|--------------|-------|
| `PUT /api/quotes` | `{ titleId, lineIndex }` | `INSERT … ON CONFLICT DO NOTHING` |
| `DELETE /api/quotes` | `{ titleId, lineIndex }` | |
| `GET /api/quotes/mine` | `?titleId=` | line indices for Curate / Play |
| `GET /api/quotes/all-mine` | `?limit=` (cap 500) | `{ titleId, lineIndex }[]` for the daily quote and a later profile shelf |
| `GET /api/quotes/popular-global` | `?limit=` (cap 500) | grouped `COUNT(*)`; fills the daily quote when the personal pool is thin |

Routing in [`api/src/index.ts`](../api/src/index.ts): the `/api/stars` block ends with a catch-all 404 for anything that doesn’t start with `/api/stars` (~line 863), so the quotes block goes **above** it.

`claimAnonymousStars` must copy `line_quotes` in the same pass it copies `stars`, inside the same `player_claims` gate. Marks made before sign-in are orphaned otherwise. Rename it `claimAnonymousMarks` and keep the `/api/auth/claim` response shape.

No per-title cap in v1 (stars have none; the ♥ cap is about queue bias, which quotes don’t touch). The abuse bound is a soft rate limit, which belongs with the rest of L2 in the security ladder.

## Client

New `src/lib/quotes/{store,api,sync}.ts`, parallel to `src/lib/stars/*` rather than widening `Star`:

- `store.ts` — `localStorage` key `textline-nextline-quotes`, `{ titleId, lineIndex, text, quotedAt }`. `isQuoted`, `getQuotedLineIndices(titleId)`, `listQuotes`, `setQuoteLocal`, `removeQuoteLocal`, `mergeRemoteQuotes`.
- `api.ts` — the five calls above, same `isStarApiEnabled` / bearer handling as `stars/api.ts`.
- `sync.ts` — `toggleQuote` writes locally first, then syncs and **rolls back on failure** (copy `toggleStar`); `hydrateQuotesForTitle`.

Separate modules keep the star store’s meaning intact, and nothing that builds a queue has a reason to import the quote module.

## The invariant, and a test that holds it

> A quote mark never reaches a question.

Concretely: nothing under `src/lib/quotes/` may be imported by `src/lib/game/miniGame.ts`, `src/lib/game/dailyLoad.ts`, `App.beginGame`, `SetupScreen`’s mini count, or anything in `api/src/shares.ts`. `test/quotes-isolation.test.ts`:

1. Build a mini-game queue for a fixture title where a quote-marked line is the **last** line (not a valid prompt) and assert it’s absent — and that every queue entry is in `getValidPromptIndices`.
2. Read those module sources and assert they contain no `quotes/` import. Crude, and it catches the exact regression that costs a bad mini-game in production.

## UI

**Curate** ([`src/components/CurateScreen.tsx`](../src/components/CurateScreen.tsx))

- Row pool becomes mode-aware: **Quiz lines** (today’s `promptIndices`, default) or **All lines** (`getPlayableLines(title).map(l => l.index)`). In All lines, non-prompt rows disable star and love with the reason in `aria-label` and show a short “no next line” note.
- Marks cluster per decision 3; `handleQuote` mirrors `handleToggle`, and the `starSets` memo grows a `quoted` set so it stays one `localStorage` read per revision (rows are in the thousands — do not read per row).
- Toolbar gains **Quoted only** beside Starred only.
- Header count reads `N starred · M quotes`.
- Mobile ≤520px: shrink the three squares rather than wrapping the cluster.

**Play** ([`src/components/PlayScreen.tsx`](../src/components/PlayScreen.tsx))

- Third text button after love: `❝ Quote` / `❝ Quoted`, no star gate. Confirm `.prompt-actions` wraps at narrow widths with three buttons plus send.
- Quote state resets on prompt change in the existing `useEffect`.

Not in this branch: the chat quote-card icon, a profile Quotes shelf, a Quotes filter in `#/search`, cover stills preferring a quote-marked frame.

## Output side — quote of the day

- [`src/lib/game/dailyPick.ts`](../src/lib/game/dailyPick.ts): add `DailyQuote` and `pickQuoteOfDay(date, personalPool, globalPool, excluded)`. Reuse `rngFor` with its own seed label (`${date}:quote`) and `keysInWindow` for the same 7-day no-repeat. Do not touch `pickDailyCards`.
- `framed()` in [`dailyLoad.ts`](../src/lib/game/dailyLoad.ts) checks `hasSceneFrame` **and** `canPrompt`. Split out a frame-only check for quotes — a quote needs a frame, not a next line.
- `loadTodaysQuote()`: personal marks first (local store, hydrated), then `GET /api/quotes/popular-global`.
- [`DailyHome.tsx`](../src/components/DailyHome.tsx): a **Quote of the day** card under the three question cards — still, line, title, no choices. Tapping it opens [`QuoteImageExportModal`](../src/components/QuoteImageExportModal.tsx), which already renders a line with no quiz. No streak effect.

## Tests

| File | Covers |
|------|--------|
| `test/api-quotes.test.ts` | body validation, put/delete idempotence, mine / all-mine / popular-global, claim copies quotes (mock D1 like [`test/api-stars.test.ts`](../test/api-stars.test.ts)) |
| `test/quotes-sync.test.ts` | local toggle, rollback on API failure, remote merge (mirror `stars-sync.test.ts`) |
| `test/quotes-isolation.test.ts` | the invariant above |
| `test/dailyQuote.test.ts` | date-stable pick, 7-day no-repeat, personal before crowd, independent of the three cards |

## Slices

Each is one commit that leaves `main` shippable.

1. **Schema + API** — `api/migrations/017_line_quotes.sql`, `api/schema.sql`, `api/src/quotes.ts`, routes, claim copies quotes, `test/api-quotes.test.ts`. Add `db:migrate:line-quotes:{local,remote}` (`wrangler d1 execute textline-stars --local --file=migrations/017_line_quotes.sql`, `--remote --yes` for the other) to `api/package.json`, pass it through the root `package.json`, **and add it to the `deploy:api` chain** — prod has drifted before when a migration missed that chain. `CREATE TABLE IF NOT EXISTS` is idempotent, so this needs no `ensure-share-columns.mjs` entry; that helper is only for `ALTER … ADD COLUMN`.
2. **Client store / sync** — `src/lib/quotes/*`, `test/quotes-sync.test.ts`, `test/quotes-isolation.test.ts`.
3. **Curate** — marks cluster, All-lines pool, Quoted-only filter, counts, CSS.
4. **Play** — third mark button.
5. **Quote of the day** — picker, loader, Home card, `test/dailyQuote.test.ts`.

Then flip the README roadmap row from parked, and note the mail card as the remaining output surface.

## Deploy

`npm run deploy:api` (runs the migration chain, then the Worker) and `npm run deploy` for Pages. Verify `line_quotes` exists on remote D1 before the Pages deploy goes out, or a signed-in mark 500s.

## Risks

- **Star semantics drift.** The whole feature rests on quote marks staying out of queues. Slice 2 lands the guard test before any UI can create a mark.
- **Row clutter.** Three marks plus a pack checkbox plus send is five controls. If it reads as noise on a phone, the fallback is collapsing the pack checkbox into a select mode rather than hiding a mark.
- **Frame coverage.** The daily quote needs a still. Pool is whatever `content/stills-lines.json` covers, same limit as the daily questions.
- **Backfill temptation.** Wikiquote and Readwise seeds are mostly standalone lines, and they currently land in `stars` with `origin = 'wikiquote'`. Converting them to quote marks is a follow-up script decision (`--as-quotes`), not part of this branch.
