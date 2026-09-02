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

3. **Deploy the Worker** (from **repo root**):

   ```bash
   npm run deploy --prefix api
   ```

   Or from `api/`: `npm run deploy`. Shortcut from root: `npm run deploy:api` (migrate + deploy).

   Note the Worker URL (e.g. `https://textline-nextline-api.<account>.workers.dev`).

4. **Wire the client** — set `VITE_API_URL` when building Pages:
   - **Local:** create `.env.local` with `VITE_API_URL=https://textline-nextline-api.<account>.workers.dev`
   - **CI:** add a repository variable `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables)

5. **Redeploy Pages** so the bundle picks up the API URL.

### Local API development

```bash
cd api
npm install
npm run db:migrate:local
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

All mutating requests require header `X-Player-Id` (anonymous UUID, stored in browser `localStorage`).

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
| Mini-game queue | Your stars → crowd popular → random |
| Medium / Hard | Not enabled yet |
| Multiplayer | Not yet — needs Phase 2 backend |

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Workflow fails: missing secrets | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| `Authentication error` / exit code 1 | Token needs **Account → Cloudflare Pages → Edit**; verify account ID |
| `Project not found` | Run `wrangler pages project create textline-nextline` |
| Wrangler version mismatch in CI | Workflow uses `npx wrangler` from `package.json` (v4), not wrangler-action |
| Old episodes after deploy | Hard refresh; confirm `content/` was committed before push |
| Stars not syncing | Confirm `VITE_API_URL` in build; Worker deployed; D1 schema applied |
| CORS errors | Check Worker `ALLOWED_ORIGINS` in `api/wrangler.toml` |
| Friend's stars missing | Expected without Worker — deploy API and set `VITE_API_URL` |
