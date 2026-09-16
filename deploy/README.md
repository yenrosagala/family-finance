# FamFin API — deploy folder

Self-contained deployment unit. Everything the Express backend needs lives here.

## Contents
- `api/` — the Express app (`package.json`, `package-lock.json`, `src/`)
- `Dockerfile` — build context is THIS folder (do not change it to `..`)
- `compose.yaml` — local docker run
- `render.yaml` — Render Blueprint
- `.env.example` — template for secrets

## Required environment variables
- `DATABASE_URL` — a writable PostgreSQL URL (Aiven, Render Postgres, local).
  The API does NOT use Supabase `auth.users`: it owns its `app_users` schema and
  bootstraps it at boot (tables + balance-sync / goal rollup triggers), so a
  fresh database works with no manual migration. Not a Supabase pooled URL.
- `JWT_SECRET` — same value as in the original `api/.env`

Optional: `PORT` (defaults to 4000), `OCR_SERVICE_URL` (a PaddleOCR-VL
microservice, default 127.0.0.1:8008). The OCR microservice is NOT bundled in
this image — without it the `/api/receipt` endpoint returns a 502.

## Deploy to Render (free, no credit card)
1. Push this repo (any branch) to GitHub.
2. Render dashboard -> New + Blueprint -> connect the repo -> pick this branch.
   `render.yaml` is auto-detected and creates the service with `rootDir: deploy`.
3. After the first (failed health check) deploy, open the service -> Environment,
   add `DATABASE_URL` and `JWT_SECRET` (`sync:false` in the blueprint makes Render
   prompt for them), then deploy again.
4. Verify: GET `https://<service>.onrender.com/health` -> `{"ok":true}`.

## Deploy to Google Cloud Run / Fly / Koyeb
The Dockerfile is standard: pick branch, source folder `deploy/`, build the
Dockerfile, set `DATABASE_URL` + `JWT_SECRET` env vars, allow unauthenticated
invocations. Cloud Run additionally requires billing + card; Render does not.

## Run locally (Docker)
```
docker compose up --build
curl http://localhost:4000/health
```
Requires a real `api/.env` (copy from `.env.example` and fill in). The API
bootstraps its own schema at boot, so any writable Postgres works.

## Re-syncing `api/` after backend changes
`deploy/api/` is a snapshot of the root `api/`. After changing backend code,
re-copy api source into the snapshot so the deploy image ships the same code,
then rebuild. Both `deploy/api/` and the root `api/` include the boot-time
schema bootstrap (`api/src/db/bootstrap.js` + `schema.sql`).
