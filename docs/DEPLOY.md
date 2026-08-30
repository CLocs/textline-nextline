# Deploy — Cloudflare Pages

Single-player mode is a **static site** (`dist/`). No server, database, or API keys at runtime. Episodes are bundled at build time; stars stay in the visitor's browser (`localStorage`).

## Quick deploy (local CLI)

Prerequisites: [Cloudflare account](https://dash.cloudflare.com), [Wrangler logged in](https://developers.cloudflare.com/workers/wrangler/commands/#login).

```bash
npm install
npm run deploy
```

First run may prompt you to create the Pages project `textline-nextline`. Wrangler prints the live URL (e.g. `https://textline-nextline.pages.dev`).

## GitHub Actions (recommended)

Every push to `main` or `init_202608` runs tests, builds, and deploys.

### One-time setup

1. **Cloudflare API token** — [Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create token → **Edit Cloudflare Workers** template (includes Pages).
2. **Account ID** — Cloudflare dashboard → any zone → right sidebar, or Workers & Pages overview.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Create Pages project** (once), if the workflow fails on missing project:

   ```bash
   npx wrangler pages project create textline-nextline --production-branch=main
   ```

5. Push to `main` (or merge your branch). Check **Actions** for the deploy URL.

### Custom domain (optional)

Cloudflare dashboard → **Workers & Pages** → **textline-nextline** → **Custom domains**.

## Build locally

```bash
npm run build    # → dist/
npm run preview  # smoke-test the production build
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
| Fun mode, skip, stars | Stars are per-browser |
| Medium / Hard | Not enabled yet |
| Multiplayer | Not yet — needs Phase 2 backend |

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Workflow fails: missing secrets | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| `Project not found` | Run `wrangler pages project create textline-nextline` |
| Old episodes after deploy | Hard refresh; confirm `content/` was committed before push |
| Friend's stars missing | Expected — stars are local until we add sync |
