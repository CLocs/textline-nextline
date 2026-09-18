# Deploy — Cloudflare Pages + Star Sync API

The game is a **static site** (`dist/`) on Cloudflare Pages. Episodes are bundled at build time. **Stars** sync to a separate **Cloudflare Worker + D1** API when `VITE_API_URL` is set at build time.

## Quick deploy (Pages)

Prerequisites: [Cloudflare account](https://dash.cloudflare.com), [Wrangler logged in](https://developers.cloudflare.com/workers/wrangler/commands/#login).

```bash
npm install
npm run deploy
```

First run may prompt you to create the Pages project `textline-nextline`. Wrangler prints the live URL (e.g. `https://textline-nextline.pages.dev`).

## Star sync API (Worker + D1)

Stars persist across browsers when the Pages build includes `VITE_API_URL` pointing at the deployed Worker.

### One-time setup

1. **Create D1 database** (from repo root):

   ```bash
   cd api
   npm install
   npx wrangler d1 create textline-stars
   ```

   Copy the `database_id` from the output into [`api/wrangler.toml`](api/wrangler.toml) (`[[d1_databases]]` → `database_id`).

2. **Apply schema** (from **repo root**):

   ```bash
   npm run db:migrate:api:remote
   ```

   If you're already in `api/`, run `npm run db:migrate:remote` instead (no `--prefix`).

   For an **existing** D1 that already has the stars table, apply later migrations only:

   ```bash
   npm run db:migrate:auth:remote --prefix api
   npm run db:migrate:runs:remote --prefix api
   npm run db:migrate:shares:remote --prefix api
   npm run db:migrate:friends:remote --prefix api
   npm run db:migrate:inbox:remote --prefix api
   npm run db:migrate:groups:remote --prefix api
   ```

3. **Deploy the Worker** (from **repo root**):

   ```bash
   npm run deploy --prefix api
   ```

   Or from `api/`: `npm run deploy`. Shortcut from root: `npm run deploy:api` (migrate + deploy).

   Note the Worker URL (e.g. `https://textline-nextline-api.<account>.workers.dev`).

4. **Auth secrets (Phase 2a — magic link)** — from `api/`:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put AUTH_SECRET
   ```

   Optional vars in [`api/wrangler.toml`](api/wrangler.toml):
   - `APP_ORIGIN` — production: `https://textline-nextline.pages.dev` (used in email links + share URLs)
   - `RESEND_FROM` — verified sender, e.g. `Textline <onboarding@resend.dev>` (or your domain after Resend DNS)

   Without `RESEND_API_KEY`, the Worker **logs** the magic link to wrangler logs (fine for local `wrangler dev`).

5. **Google Sign-In (Phase 2a.2 — optional)** — free; no per-login fee.

   1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **OAuth consent screen** (External) → add test users while in Testing, then **Publish** when ready for anyone.
   2. **Credentials** → Create **OAuth client ID** → Application type **Web application**.
   3. Authorized JavaScript origins: `http://localhost:5173`, `https://textlinenextline.com`, `https://www.textlinenextline.com`, `https://textline-nextline.pages.dev` (and any preview origins you care about).
   4. From `api/`:

      ```bash
      npx wrangler secret put GOOGLE_CLIENT_ID
      ```

      Paste the Web client ID (looks like `….apps.googleusercontent.com`). Redeploy the Worker.
   5. Optional local fallback in `.env.local`: `VITE_GOOGLE_CLIENT_ID=…` (same value). Usually unnecessary once `GET /api/auth/config` works.

   Login shows **Continue with Google** when `GOOGLE_CLIENT_ID` is set; magic link remains for Yahoo/etc.

6. **Wire the client** — set `VITE_API_URL` when building Pages:
   - **Local:** create `.env.local` with `VITE_API_URL=https://textline-nextline-api.<account>.workers.dev`
   - **CI:** add a repository variable `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables)

7. **Redeploy Pages** so the bundle picks up the API URL. Update Worker `APP_ORIGIN` to production before sharing magic links / mini-game URLs from prod.

### Local API development

```bash
cd api
npm install
npm run db:migrate:local
npm run db:migrate:auth:local   # if D1 was created before Phase 2a
npm run db:migrate:runs:local   # if D1 was created before Phase 2.5
npm run db:migrate:shares:local  # if D1 was created before frozen mini-game shares
npm run db:migrate:friends:local # if D1 was created before the friends graph
npm run db:migrate:inbox:local   # if D1 was created before the question inbox
npm run db:migrate:groups:local  # if D1 was created before named friend groups
npm run dev
```

In another terminal, run the Vite app with `VITE_API_URL=http://localhost:8787` in `.env.local`.

CORS allows `localhost:5173`, production `textline-nextline.pages.dev`, and preview branches `*.textline-nextline.pages.dev`.

### API routes

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/api/stars` | Star a line. Body: `{ titleId, lineIndex }` |
| `DELETE` | `/api/stars` | Unstar. Body: `{ titleId, lineIndex }` |
| `GET` | `/api/stars/mine?titleId=` | Current player's starred indices |
| `GET` | `/api/stars/popular?titleId=&limit=50` | Crowd ranking by star count |
| `POST` | `/api/auth/request-link` | Body `{ email }` → magic link email |
| `POST` | `/api/auth/verify` | Body `{ token }` → `{ user, sessionToken }` |
| `POST` | `/api/auth/google` | Body `{ idToken }` → `{ user, sessionToken }` (GIS credential) |
| `GET` | `/api/auth/config` | `{ googleClientId }` — public; null if Google Sign-In unset |
| `GET` | `/api/auth/me` | Current user (Bearer session) |
| `PATCH` | `/api/auth/me` | Body `{ displayName }` — update display name |
| `POST` | `/api/auth/logout` | Invalidate session |
| `POST` | `/api/auth/claim` | Body `{ anonymousPlayerId }` → merge anonymous stars |
| `POST` | `/api/shares` | Create mini-game share (auth). Body `{ titleId }` |
| `GET` | `/api/shares/:id` | Share metadata (auth) |
| `GET` | `/api/shares/:id/queue` | Prompt line indices (auth). `{ titleId, lineIndices, frozen }` — `frozen: true` is an exact replay |
| `POST` | `/api/shares/:id/runs` | Submit scores (auth) |
| `GET` | `/api/shares/:id/runs` | Share leaderboard (auth) |
| `POST` | `/api/runs` | Persist a completed run (auth). Body includes client `id` (UUID) and optional `questionQueue` |
| `GET` | `/api/runs/mine` | Match history for the signed-in user |
| `POST` | `/api/runs/:id/share` | Freeze that mini-game’s prompt list; returns `{ shareId, url }` |
| `PATCH` | `/api/runs/:id/rating` | Body `{ thumb: "up" \| "down" }` |
| `GET` | `/api/stats/played` | Global play counts per `titleId` (auth) |
| `GET` | `/api/stats/title?titleId=` | Per-title player leaders: games played + best correct (auth) |
| `GET` | `/api/ops/catalog` | Owner-only star counts + play counts per title |
| `POST` | `/api/friends/invite` | Create or reuse the current friend link (auth). `{ url, reused }` — `url` is null when a live hashed invite already exists |
| `POST` | `/api/friends/invite/rotate` | Issue a new token; old URL dies (auth) |
| `GET` | `/api/friends/invite/:token` | Preview `{ displayName }` only (no email). Auth optional (`isSelf` / `alreadyFriends` when signed in) |
| `POST` | `/api/friends/accept` | Body `{ token }` — mutual friendship (auth) |
| `GET` | `/api/friends` | `{ friends: [{ userId, displayName }] }` (auth). Never email. No `GET /api/users` |
| `DELETE` | `/api/friends/:userId` | Unfriend (auth) |
| `POST` | `/api/friends/:userId/block` | Unfriend + reject future accepts from that user (auth) |
| `POST` | `/api/inbox/share` | Frozen 1-line play URL (auth). Body `{ titleId, lineIndex }` → `{ shareId, url }` |
| `POST` | `/api/inbox` | Send that line to a friend or group (auth). Body `{ titleId, lineIndex, toUserId }` or `{ titleId, lineIndex, groupId }` |
| `GET` | `/api/inbox` | Received lines: `{ items: [{ shareId, titleId, lineIndex, from: { userId, displayName } }] }` — never email |
| `GET` | `/api/groups` | Owner’s send-lists: `{ groups: [{ id, name, members: [{ userId, displayName }] }] }` (auth). Never email |
| `POST` | `/api/groups` | Create `{ name }` (auth). Cap ~10 |
| `POST` | `/api/groups/:id/members` | Body `{ userId }` — must already be a friend (auth) |
| `DELETE` | `/api/groups/:id/members/:userId` | Remove a member (auth) |
| `DELETE` | `/api/groups/:id` | Delete the list (auth) |

Star routes: prefer `Authorization: Bearer <session>` (user id as `player_id`); fall back to `X-Player-Id` for anonymous. Share, run, stats, friends, groups, inbox, and ops routes require auth (invite preview is public).

Each star row is `(title_id, line_index, player_id)`. The static Pages app does **not** store stars; it calls this Worker. `content/stars-seed.json` is only a local match list until you push it:

```bash
npm run content:stars-push -- --email you@example.com --remote --dry-run
```

Skips titles in `content/stars-protected.json` (even with `--force`) and any title that already has live stars. Do not `--force` titles you curated in the app.

That inserts seed lines as the `users.id` for that email (you must have magic-link signed in once). Re-opening the game signed in hydrates them via `GET /api/stars/mine`.

## Quote stills (R2)

Quote JPEGs are **not** in git. Production Pages reads them from a private R2 bucket.

### One-time setup

1. **Create the bucket** (from repo root):

   ```bash
   npx wrangler r2 bucket create textline-stills
   ```

2. **Binding** is already in [`wrangler.toml`](../wrangler.toml) (`STILLS` → `textline-stills`). The Function is [`functions/stills/[[all]].ts`](../functions/stills/[[all]].ts).

3. **Upload** confirmed preview stills (gitignored `inbox/stills-preview/`):

   ```bash
   npm run content:stills:push -- --title oceans-thirteen-2007 --title the-wolf-of-wall-street-2013
   ```

   Omit `--title` to push every folder. Skip titles that have not been eyeballed (Empire PAL is not ready).

4. **Deploy Pages** so the Function and R2 binding go live (`npm run deploy` or push to `main`). Until then `/stills/...` 404s in production and the play UI falls back to the poster.

The GitHub `CLOUDFLARE_API_TOKEN` (Workers Edit template) already includes R2. No public bucket URL — only the Pages Function can read objects.

Local Vite still serves `inbox/stills-preview` at `/stills` and does not need R2.

### Share links

Format: `https://textline-nextline.pages.dev/#/play/<shareId>`

Recipient must **sign in**. Setup **Share mini-game** still builds a quiz from the owner’s **current** stars (order reshuffles). Match-history **Share** freezes that run’s prompt indices so a friend plays the same 10 lines in the same order. Scores land on the share leaderboard.

## GitHub Actions (recommended)

Every push to `main` or `init_202608` runs tests, builds, deploys the **Worker + D1 migrations** (`npm run deploy:api`), then deploys Pages. Worker first so new UI never ships against an old API.

### One-time setup

1. **Cloudflare API token** — [Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create token → **Edit Cloudflare Workers** template (includes Pages + D1).
2. **Account ID** — Cloudflare dashboard → any zone → right sidebar, or Workers & Pages overview.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Optional:** repository variable `VITE_API_URL` — Worker base URL for star sync in production builds.
5. **Create Pages project** (once), if the workflow fails on missing project:

   ```bash
   npx wrangler pages project create textline-nextline --production-branch=main
   ```

6. Push to `main` (or merge your branch). Check **Actions** for the deploy URL.

Worker-only hotfix (no Pages rebuild): `npm run deploy:api` from repo root. First-time setup still needs `api/wrangler.toml` `database_id`.

### Custom domain (optional)

Cloudflare dashboard → **Workers & Pages** → **textline-nextline** → **Custom domains**.

## Build locally

```bash
npm run build    # → dist/
npm run preview  # smoke-test the production build
```

With star sync:

```bash
VITE_API_URL=https://your-worker.workers.dev npm run build
```

## Updating content

1. Add JSON to `imports/` (from transcript_maker).
2. `npm run import:all`
3. Commit `content/` changes.
4. Push — CI rebuilds and redeploys (~350 KB JS grows with each episode).

## What works in production

| Feature | Notes |
| --- | --- |
| Full episode / mini-game | Yes |
| Fun mode, skip, stars | Synced when `VITE_API_URL` is set; otherwise per-browser |
| Sign in (magic link) | Needs Resend secrets on Worker; claim merges anonymous stars |
| Share mini-game | Setup → live stars (shuffles); history Share → exact 10 prompts; friend must sign in |
| Mini-game queue | Your stars → crowd popular → random |
| Quote stills | R2 + Pages Function at `/stills/...` after `content:stills:push` |
| Medium / Hard | Not enabled yet |
| Live multiplayer rooms | Not yet — Phase 2 |

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Workflow fails: missing secrets | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| `Authentication error` / exit code 1 | Token needs **Account → Cloudflare Pages → Edit**; verify account ID |
| `Project not found` | Run `wrangler pages project create textline-nextline` |
| Wrangler version mismatch in CI | Workflow uses `npx wrangler` from `package.json` (v4), not wrangler-action |
| Old episodes after deploy | Hard refresh; confirm `content/` was committed before push |
| Stars not syncing | Confirm `VITE_API_URL` in build; Worker deployed; D1 schema applied |
| Play prompt shows poster, not a still | Extract locally, `content:stills:push`, then redeploy Pages; check `/stills/{id}/{n}.jpg` |
| Pages deploy fails on R2 binding | Token needs **Account → R2 → Edit**; bucket `textline-stills` must exist |
| Magic link not arriving | Set `RESEND_API_KEY`; check Resend domain; without key, read wrangler logs |
| Share play asks to sign in | Expected — Phase 2a requires login for attribution |
| CORS errors | Check Worker `ALLOWED_ORIGINS` in `api/wrangler.toml` |
| Friend's stars missing | Expected without Worker — deploy API and set `VITE_API_URL` |
| Friends tab **Not found** / `/api/friends/*` 404 | Worker not deployed. Merge to `main` (CI) or `npm run deploy:api` |
| `duplicate column name: question_queue` | `004` ALTER already applied. `deploy:api` now skips existing columns via `ensure-share-columns.mjs` |
