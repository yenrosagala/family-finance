# Family Cashflow

A **private, self-hosted family finance app** for a single household — not a
multitenant commercial product. Log expenses, track budgets, saving goals,
investments, and net worth, and scan receipts with OCR-assisted
categorization. Built to be genuinely useful for daily family use from day one.

```
family-cashflow/   client (Expo SDK 57 / React Native / TypeScript)
api/               Express API — the only thing the client talks to
ocr_service/       optional FastAPI service for PaddleOCR-VL receipt OCR
supabase/          RLS, triggers, Edge Functions (production hardening)
deploy/            one-server deploy package (Postgres + API + reverse proxy)
```

## Features

**Accounts & transactions**
- Auth (custom JWT, bcrypt) + household create/join by invite code, member
  management with roles (remove member, per-member spending breakdown)
- Manual, amount-first transaction entry with type picker:
  income / expense / internal & external transfers / saving / investment
- 7 transaction types respected by a database sync trigger that keeps every
  account balance correct (never write `accounts.balance` directly)

**Seeing the picture**
- Dashboard: income vs expense donut, daily/weekly/monthly series chart,
  income-allocation Sankey (income → expenses / savings / investments)
- Budgets per category with progress bars, over-budget states, and a
  dashboard budget-health strip
- Saving goals & investments with trigger-maintained `current_amount` /
  `total_invested`
- Assets/liabilities CRUD + net-worth screen with snapshot history

**Receipts**
- Optional server-side OCR (PaddleOCR-VL via `ocr_service/`)
- Dictionary + fuzzy categorization (`/api/categorize` via `api/src/services/categorizeText.js`),
  correction feedback loop, dedupe fingerprint + reconciliation checks
- **Never auto-saves a scan** — every receipt lands on a confirm/edit screen

**Data & format**
- Indonesian-style number formatting (`1.500.000`) everywhere money is shown
- Monthly statements export (XLSX / PDF) and on-device local export

## Two ways to run the app

The data source is chosen **per device at sign-up**: cloud or local.

| | **Cloud mode** | **Local mode** |
|---|---|---|
| Where data lives | Your own Express API → Postgres (e.g. Supabase) | On-device SQLite (Android/iOS only) |
| Multi-device household sharing | Yes (the household feature) | No (single device) |
| Needs a server | Yes | None — fully offline |
| Choice of the data-source switch | `src/core/dataSource.ts`, persisted per device | same |
| Limitations | — | Reports/Assets/Liabilities not yet available locally |

Web (`expo start`) always uses Cloud mode; local SQLite is a native-only path.

## Repository layout

```
api/                       Express API — backend the client actually uses
  src/server.js            app wiring, route mounting, /health
  src/auth.js              JWT sign/verify middleware
  src/db.js                Postgres pools: master DB (public) + per-household
  src/middleware/tenant.js routes each request to its household schema
  src/services/provision.js create household schema on register/join
  src/services/categorizeText.js dictionary + fuzzy categorization
  src/routes/              auth, household, accounts, categories, transactions,
                           categorize, receipt, dictionary, budgets,
                           saving-goals, investments, assets, liabilities,
                           net-worth, reports
  src/data/globalDictionary.js  bundled Indonesian item dictionary seed
  src/db/master-schema.sql  master DB schema (app_users + households_registry)
  src/db/schema.sql         per-household schema template
family-cashflow/           Expo / React Native client
  src/core/dataSource.ts   cloud-vs-local switch
  src/services/*           api.ts (HTTP client + base URL), auth, transaction,
                           budget, savingGoal, investment, asset, liability,
                           netWorth, report, local/ (SQLite repo + dbs)
  src/screens/             auth, dashboard, transactions, more (settings,
                           budgets, saving goals, investments, net worth,
                           export report, ...)
ocr_service/               FastAPI PaddleOCR-VL (+ Dockerfile, start.ps1)
supabase/                  rls_policies.sql, triggers.sql, Edge Functions
deploy/                    one-server deploy package (see below)
schema.sql                 authoritative single-file data model (all schemas)
```

### Architecture notes

- **Multi-tenant by schema, not by row.** One Postgres "master" DB holds
  `app_users` and `households_registry`. Registering a household provisions a
  dedicated schema `hh_<slug>_<suffix>` for that family. The API scopes every
  query by household in code (`src/middleware/tenant.js`).
- **Balance changes only via trigger.** `supabase/triggers.sql` syncs account
  balances and saving/investment rollups; the client/API never write
  `accounts.balance` directly.
- **P&L correctness:** only `income`/`expense` count toward cashflow and
  reports. Transfers, savings, and investments move money within the
  household — they are not gains/losses anywhere.
- **OCR is deliberately bolt-on.** Parsing (`categorizeText.js`) and the OCR
  service are separate so each is testable independently.
- The current client talks to a **session-pooler** Postgres URL (port 5432).
  Transaction-pooler URLs (`:6543` / pgbouncer) are rejected at startup
  because the sync trigger needs `BEGIN/COMMIT`.

## Quickstart (development)

### 1. Database

The API needs one Postgres database with the master schema applied:

- **Option A — Supabase (hosted)** create a project at supabase.com and run
  `api/src/db/master-schema.sql` in its SQL editor.
- **Option B — local Postgres** (Docker is included for convenience):
  ```bash
  docker compose up -d db        # postgres on host port 5433 → inside 5432
  # or use deploy/db/master-schema.sql against any Postgres you control
  ```

### 2. API

```bash
cd api
npm install
cp .env.example .env
# edit .env, then:
npm start                        # http://localhost:4000, /health returns {ok:true}
```

`.env` requires:

```
PORT=4000
MASTER_DATABASE_URL=postgresql://user:password@...pooler.supabase.com:5432/postgres   # session pooler, port 5432
JWT_SECRET=<long-random-secret>
OCR_SERVICE_URL=http://localhost:8000     # optional, only if using ocr_service
```

### 3. Client

```bash
cd family-cashflow
npm install
npx expo start --host lan        # scan QR with Expo Go (same Wi-Fi)
```

If the phone cannot reach the API on `localhost:4000`, point the app at the
LAN machine with an `EXPO_PUBLIC_API_URL` environment variable / `.env`
(e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`). For standalone APK/IPA
builds the URL is inlined at build time — see the "Standalone builds" section
below.

### 4. OCR (optional)

```powershell
cd ocr_service
pip install -r requirements.txt   # transformers 5.x + paddle/vision bits
.\start.ps1                       # FastAPI on http://localhost:8000
```

> **Status:** the OCR service loads and its `/ocr` endpoint responds, but
> image-conditioned output quality is still unresolved (the model emits
> ~1 spurious token per image under the current transformers-version compat
> path). It is not the scan default until it reads real text.

## Deployment

Two supported routes, both covered in **`deploy/README.md`**:

1. **One server, bare metal to Caddy** (`deploy/deploy.sh`) — installs
   Postgres + Node 20, loads the master schema, runs the API as a systemd
   service, and (optionally) fronts it with Caddy for automatic HTTPS.
   ```bash
   scp -r deploy user@your-server:/opt/
   ssh user@your-server "cd /opt/deploy && sudo bash deploy.sh"
   ```
2. **Containerized / PaaS** — `deploy/Dockerfile` (+ `deploy/render.yaml` for
   Render, `deploy/compose.yaml`) for a DB service and the API service.

After deploying, point the client at it:
`EXPO_PUBLIC_API_URL=https://your-api.example.com` and check `/health`.

## Standalone builds (signed APK/IPA)

`EXPO_PUBLIC_API_URL` is inlined into the binary at build time:

- **EAS Build (recommended):** `eas secrets:set EXPO_PUBLIC_API_URL` then
  `eas build --platform android` (or `--platform ios`, requires Apple
  Developer account + signing).
- **Local export:** `EXPO_PUBLIC_API_URL=https://your-api... npx expo export --platform android`, then wrap the output in your Android Studio project.

A standalone build uses `EXPO_PUBLIC_API_URL` for API calls; the Expo Go /
Metro "LAN" flow uses the dev-server hostUri — the two are independent.

## Testing

- **Unit tests (Jest)** cover the categorization logic: exact match, fuzzy
  match, fallback to global dictionary, fallback to "Uncategorized".
- **Balance-sync trigger** should be tested for all 7 transaction types plus
  edit and delete before every release.
- Full manual checks before any stage is called done:
  `PRODUCTION_READY_CHECKLIST.md`.

## Documentation index

| Document | Contents |
|---|---|
| `ARCHITECTURE.md` / `ARCHITECTURE-ESSENTIALS.md` | Data model, transaction-type/balance-effect table, categorization order — read these before touching schema or balance logic |
| `schema.sql` | Authoritative single-file data model (master + household schemas) |
| `API docs` | See `api/src/routes/` and `api/.env.example` |
| `DEVELOPMENT.md` | Step-by-step development setup, structure, gotchas |
| `PRODUCTION_PLAN.md` | Stage sequencing, milestones, risks, rollback |
| `PRODUCTION_READY_CHECKLIST.md` | Pre-release checks (data integrity, security, backups) |
| `FEATURE_CHECKLIST.md` | Per-phase feature status (⬜/🟨/✅), including deferred non-goals |
| `deploy/README.md` | Server deployment instructions (bare metal + Docker/PaaS) |
| `AGENTS.md` | Rules for AI coding agents working in this repo |
| `PRD.md` | Product requirements and scope |

## Standing rules (non-negotiable)

1. Income/expense are the **only** transaction types that affect net
   cashflow / P&L. Transfers, savings, investments move money within the
   household — never add them to income/expense totals.
2. A scanned receipt is **never auto-saved** — always a confirm/edit screen.
3. Saving goals are a **label over an account**, not a separate net-worth
   asset — never add their `current_amount` on top of account balances.
4. New tables ship with RLS policies in the same change.
5. Account balances change **only via the sync trigger** — never by direct
   client-side writes.