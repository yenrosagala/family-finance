# FamFin API — deploy folder

Self-contained deployment unit. Everything the Express backend needs lives here.

## Contents
- `api/` — the Express app (`package.json`, `package-lock.json`, `src/`)
- `db/master-schema.sql` — the one-time master schema (loaded by `deploy.sh`)
- `deploy.sh` — bare-metal Ubuntu/Debian setup: Postgres (same server) + Node + systemd
- `Dockerfile` — build context is THIS folder (do not change it to `..`)
- `compose.yaml` — local docker run
- `render.yaml` — Render Blueprint
- `.env.example` — template for secrets

## Option A — one server: DB + API (bare metal, recommended)
Upload this whole folder, then on the server:
```
scp -r deploy user@server:/opt/
ssh user@server
cd /opt/deploy && sudo bash deploy.sh
```
What it does: installs Postgres + Node 20, creates role/db `famfin`, loads
`db/master-schema.sql`, writes `api/.env` (local Postgres + JWT_SECRET), installs
deps, starts the API as a systemd service (`famfin-api`, survives reboot),
optionally adds Caddy HTTPS when `FAMFIN_DOMAIN=api.example.com` is set.

Customize first (edit the top of `deploy.sh`): `DB_PASSWORD`, `JWT_SECRET`,
optional `OCR_SERVICE_URL`, optional `FAMFIN_DOMAIN`.

Verify: `curl http://127.0.0.1:4000/health` → `{"ok":true}`.

## Required environment variables
- `MASTER_DATABASE_URL` — a writable PostgreSQL URL for the single, developer-owned
  master project (Aiven, Render Postgres, Supabase, local). Run
  `api/src/db/master-schema.sql` in it once — it stores only `app_users` and
  `households_registry`, never household financial data.
  Every household then gets its own Postgres schema, created on demand inside
  this same database when an admin registers (`api/src/services/provision.js`
  runs `api/src/db/schema.sql` inside a fresh `hh_<slug>_<suffix>` schema and
  registers it). See `TENANT_MIGRATION.md` at the repo root for the full
  request-path walkthrough (`tenantMiddleware` → `req.householdDb`).
- `JWT_SECRET` — same value as in the original `api/.env`

Optional: `PORT` (defaults to 4000), `OCR_SERVICE_URL` (a PaddleOCR-VL
microservice, default `http://127.0.0.1:8008`). That service is NOT bundled
in this image — deploy it separately (see `../ocr_service/README.md`) and
point `OCR_SERVICE_URL` at it. Without it, only `POST /api/receipt/ocr`
(photo → text) fails with a `503`; manual entry and everything else in the
app work normally.

## Deploy to Render (free, no credit card)
1. Push this repo (any branch) to GitHub.
2. Render dashboard -> New + Blueprint -> connect the repo -> pick this branch.
   `render.yaml` is auto-detected and creates the service with `rootDir: deploy`.
3. After the first (failed health check) deploy, open the service -> Environment,
   add `MASTER_DATABASE_URL` and `JWT_SECRET` (`sync:false` in the blueprint makes
   Render prompt for them), then deploy again.
4. Verify: GET `https://<service>.onrender.com/health` -> `{"ok":true}`.

## Deploy to Google Cloud Run / Fly / Koyeb
The Dockerfile is standard: pick branch, source folder `deploy/`, build the
Dockerfile, set `MASTER_DATABASE_URL` + `JWT_SECRET` env vars, allow
unauthenticated invocations. Cloud Run additionally requires billing + card;
Render does not.

## Run locally (Docker)
```
docker compose up --build
curl http://localhost:4000/health
```
Requires a real `api/.env` (copy from `.env.example` and fill in), and the
master schema must exist in the target Postgres already — apply
`db/master-schema.sql` to it once (`psql $MASTER_DATABASE_URL -f db/master-schema.sql`).
Household schemas are created on demand at register time. Any writable session-mode
Postgres works.

## Re-syncing `api/` after backend changes
`deploy/api/` is a snapshot of the root `api/`. After changing backend code,
re-copy api source into the snapshot so the deploy image ships the same code,
then rebuild. Both `deploy/api/` and the root `api/` include the boot-time
schema bootstrap (`api/src/db/bootstrap.js` + `schema.sql`).
