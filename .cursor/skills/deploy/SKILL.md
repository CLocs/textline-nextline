---
name: deploy
description: >-
  Deploys Cloudflare Pages and/or the Worker+D1 API. Use when the user says
  "deploy", "ship", "deploy the worker", "deploy api", "deploy:api",
  "wrangler deploy", or "prefix api".
---

# Deploy

Two targets. Merging to `main` deploys **both** via GitHub Actions. Do **not** deploy unless the user asked.

## Commands (repo root)

| Goal | Command |
|------|---------|
| **Worker + D1** (API routes, friends, stars, auth) | `npm run deploy:api` |
| **Pages only** (static game UI) | `npm run deploy` |

`deploy:api` already uses `--prefix api` and applies remote D1 migrations (`--yes`). Never run `wrangler deploy` from the repo root. Never tell the user to remember `--prefix api`.

## Which one

- `api/` changed, new routes, or production 404s on `/api/*` → `deploy:api`
- Only `src/`, `content/`, or CSS → Pages is enough (`npm run deploy` locally, or wait for CI on `main`)
- User says “deploy” after API work, or both changed → `deploy:api` first, then Pages if they also want the UI live before merge

## After Worker deploy

Confirm a friends/auth route is **200**, not **404** (`POST /api/friends/invite` with a session, or `GET /api/auth/config`).
