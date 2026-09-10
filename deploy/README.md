# FamFin API — deploy folder

Self-contained deployment unit. Everything the Express backend needs lives here.

## Contents
- `api/` — the Express app (`package.json`, `package-lock.json`, `src/`)
- `family-cashflow/src/services/local/receiptParser.js` — the one file imported
  across the monorepo (`api/src/routes/receipt.js` imports it as
  `../../../family-cashflow/src/services/local/receiptParser.js`; the relative
  path is mirrored so it resolves inside the container/source tree)
- `Dockerfile` — build context is THIS folder (do not change it to `..`)
- `compose.yaml` — local docker run
- `render.yaml` — Render Blueprint
- `.env.example` — template for secrets

## Required environment variables
- `DATABASE_URL` — Supabase pooler URL (Settings -> Database -> Connection pooling -> URI, port 6543)
- `JWT_SECRET` — same value as in the original `api/.env`

Optional: `PORT` (defaults to 4000), `OCR_SERVICE_URL` (PaddleOCR-VL microservice, otherwise the receipt OCR endpoint calls localhost:8008).

## Deploy to Render (free, no credit card)
1. Push this repo (any branch) to GitHub.
2. Render dashboard -> New + Blueprint -> connect the repo -> pick this branch.
   `render.yaml` is auto-detected and creates the service with `rootDir: deploy`.
3. After the first (failed health check) deploy, open the service -> Environment,
   add `DATABASE_URL` and `JWT_SECRET` (sync:false in the blueprint makes Render
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
Requires a real `api/.env` (copy from `.env.example` and fill in) with valid
Supabase credentials — Supabase is remote and must be reachable.