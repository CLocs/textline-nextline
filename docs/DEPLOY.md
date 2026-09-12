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

   For an **existing** D1 that already has the stars table, apply the Phase 2a migration only:

   ```bash
   npm run db:migrate:auth:remote --prefix api
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

5. **Wire the client** — set `VITE_API_URL` when building Pages:
   - **Local:** create `.env.local` with `VITE_API_URL=https://textline-nextline-api.<account>.workers.dev`
   - **CI:** add a repository variable `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables)

6. **Redeploy Pages** so the bundle picks up the API URL. Update Worker `APP_ORIGIN` to production before sharing magic links / mini-game URLs from prod.

### Local API development

```bash
cd api
npm install
npm run db:migrate:local
npm run db:migrate:auth:local   # if D1 was created before Phase 2a
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
| `GET` | `/api/auth/me` | Current user (Bearer session) |
| `POST` | `/api/auth/logout` | Invalidate session |
| `POST` | `/api/auth/claim` | Body `{ anonymousPlayerId }` → merge anonymous stars |
| `POST` | `/api/shares` | Create mini-game share (auth). Body `{ titleId }` |
| `GET` | `/api/shares/:id` | Share metadata (auth) |
| `GET` | `/api/shares/:id/queue` | Owner star line indices (auth) |
| `POST` | `/api/shares/:id/runs` | Submit scores (auth) |
| `GET` | `/api/shares/:id/runs` | Share leaderboard (auth) |

Star routes: prefer `Authorization: Bearer <session>` (user id as `player_id`); fall back to `X-Player-Id` for anonymous. Share routes require auth.

### Share links

Format: `https://textline-nextline.pages.dev/#/play/<shareId>`

Recipient must **sign in**; then they play a mini-game built from the sharer's stars. Scores land on the share leaderboard.

## GitHub Actions (recommended)

Every push to `main` or `init_202608` runs tests, builds, and deploys Pages.

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

Deploy the Worker separately with `npm run deploy:api` after updating `api/wrangler.toml` with your D1 `database_id`.

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
| Share mini-game | Setup → Share link; friend must sign in; scores on share |
| Mini-game queue | Your stars → crowd popular → random |
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
| Magic link not arriving | Set `RESEND_API_KEY`; check Resend domain; without key, read wrangler logs |
| Share play asks to sign in | Expected — Phase 2a requires login for attribution |
| CORS errors | Check Worker `ALLOWED_ORIGINS` in `api/wrangler.toml` |
| Friend's stars missing | Expected without Worker — deploy API and set `VITE_API_URL` |
