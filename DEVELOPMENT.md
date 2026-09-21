# Development Guide

## Overview

This repo has three moving parts:

- **`family-cashflow/`** — Expo SDK 57 / React Native client (TypeScript), runs in Expo Go. Supports two data sources chosen per device at sign-up: **cloud** (Supabase-backed API) or **local** (on-device SQLite, Android/iOS only).
- **`api/`** — Node.js / Express API bridge that the client talks to. It connects to a **master Postgres** database (`app_users` + `households_registry` in the `public` schema) via the **session pooler (port 5432)** and routes each request to the household's own `hh_<slug>_<suffix>` schema (`src/middleware/tenant.js`).
- **`ocr_service/`** — optional FastAPI service for server-side receipt OCR (PaddleOCR-VL).

There is no direct Supabase JS client or Edge Function dependency in the current client; the `supabase/` folder (RLS, triggers, functions) is retained for production hardening and when moving off the superuser-bypass pattern.

## Prerequisites

- Node.js 18+ (`node --version`)
- npm (`npm --version`)
- Expo Go app on your device (iOS App Store / Android Play Store), or an emulator
- A hosted Supabase project (free tier is enough for family-scale use)
- A device with a camera (for testing receipt scan)

## 1. Set Up the Database

The API connects to one Postgres "master" database using the **session pooler**
(port 5432). It must use the session pooler because the account-balance sync
trigger relies on `BEGIN/COMMIT`, which the transaction pooler (`:6543` /
pgbouncer) breaks — the API rejects transaction-pooler URLs at startup.

The master DB is multi-tenant by schema: `public` holds only `app_users` and
`households_registry`; each household gets its own `hh_<slug>_<suffix>`
schema created automatically at register/join (`src/services/provision.js`).

1. Create a Postgres DB (Supabase project at supabase.com, or `docker compose up -d db` for local).
2. Apply the master schema once:
   - Supabase: paste `api/src/db/master-schema.sql` into the SQL editor.
   - Local Docker: `psql "$DATABASE_URL" -f api/src/db/master-schema.sql`
3. Get the **session pooler** connection string (Supabase: Project Settings → Database → Connection string, choose the 5432 pooler).
   - Format: `postgresql://<user>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - Local Docker: `postgresql://postgres:postgres@localhost:5433/postgres`

> Note: the API currently connects as the DB superuser (`postgres`) and
> bypasses RLS, scoping in code by household schema. Before production you
> should switch to role-based DB access so RLS is the enforcement layer. See
> `PRODUCTION_READY_CHECKLIST.md`.

## 2. Run the API

```bash
cd api
npm install
cp .env.example .env
```

Fill in `api/.env`:
```
PORT=4000
MASTER_DATABASE_URL=postgresql://USER:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres
JWT_SECRET=<long-random-secret>
# OCR_SERVICE_URL=http://localhost:8000   # optional, only if using ocr_service
```

Then start it:
```bash
npm start          # Express API on http://localhost:4000  (/health → {ok:true})
```

Demo seed (optional, creates a demo user + household used in local tests):
```bash
node seed-demo.js
```

## 3. Run the Client

```bash
cd family-cashflow
npm install
npx expo start --host lan --port 8082 --clear
```

Scan the QR with the Expo Go app on your device (same Wi-Fi network) or press `a`/`i` for an emulator.

The client talks to the API at the URL in `EXPO_PUBLIC_API_URL` (a `.env`
value or process env; defaults to `http://localhost:4000`). For a physical
phone, set it to the machine running the API, e.g.:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

Set this once in `family-cashflow/.env`. Each member picks the data source
(cloud or local) at sign-up; local mode runs entirely on the device.

> If you change the Expo SDK version, restart the dev server with `--clear` and make sure the installed **Expo Go** app on your phone matches the SDK (e.g. SDK 57). A mismatch shows "Project is incompatible with this version of Expo Go / failed to download remote update."

## 4. Project Structure

```
family-cashflow/              # Expo / React Native client
  App.tsx                     # entry - auth state gate (session -> household -> main)
  app.json                    # Expo config (plugins, permissions, icons, name/slug)
  src/
    core/theme.ts             # colors, spacing, typography tokens
    core/dataSource.ts        # cloud-vs-local data source switch (per device)
    core/format.ts            # Indonesian number formatting (1.500.000)
    constants/                # config + category/transaction-type constants
    models/index.ts           # TS interfaces mirroring Postgres tables
    services/
      api.ts                  # HTTP client + token storage + base URL (EXPO_PUBLIC_API_URL)
      authService.ts          # sign up/in/out, household create/join, members
      transactionService.ts   # accounts (incl. opening balance), categories, transactions
      budgetService.ts        # budgets
      savingGoalService.ts    # saving goals
      investmentService.ts    # investments
      assetService.ts         # assets
      liabilityService.ts     # liabilities
      netWorthService.ts      # net worth (+snapshots)
      reportService.ts        # report export (xlsx / expo-print)
      local/                  # on-device SQLite repo (repository.ts, database.web/native.ts)
    screens/
      auth/                   # AuthScreen (data-source + sign in/up)
      dashboard/              # DashboardScreen
      transactions/           # TransactionsScreen, AddTransactionScreen
      more/                   # MoreScreen, BudgetsScreen, SavingGoalsScreen,
                              # InvestmentsScreen, NetWorthScreen, AssetsScreen,
                              # LiabilitiesScreen, ManageAccountsScreen,
                              # ManageCategoriesScreen, HouseholdMembersScreen,
                              # ExportReportScreen
    navigation/AppNavigator.tsx  # tab + stack navigation
    widgets/                  # shared UI components (charts, donut, sankey, ...)
api/                          # Express backend
  src/
    server.js                 # app wiring, route mounting, /health
    auth.js                   # JWT sign/verify middleware
    db.js                     # master Postgres pool (from MASTER_DATABASE_URL) + household pool factory; rejects :6543
    middleware/tenant.js      # routes each request to its household schema
    services/categorizeText.js# dictionary + fuzzy categorization (exact → fuzzy → fallback)
    services/provision.js     # creates hh_<slug>_<suffix> schema on register/join
    data/globalDictionary.js  # global Indonesian item dictionary seed
    routes/                   # auth, household, accounts, categories, transactions,
                              # categorize, receipt, dictionary, budgets, saving-goals,
                              # investments, assets, liabilities, net-worth, reports
    db/master-schema.sql      # master DB schema (app_users + households_registry)
    db/schema.sql             # per-household schema template
  .env                        # git-ignored; PORT, MASTER_DATABASE_URL, JWT_SECRET, OCR_SERVICE_URL
  seed-demo.js                # demo user + household seed
ocr_service/                  # FastAPI PaddleOCR-VL (optional) + Dockerfile
schema.sql                    # authoritative combined data model
supabase/                     # RLS policies, triggers, Edge Functions (hardening)
deploy/                       # one-server deploy package (deploy.sh, Dockerfile, render.yaml)
```

## 5. Testing

- Unit tests (Jest): categorization matching logic (exact, fuzzy, global
  dictionary fallback, "Uncategorized" fallback) — highest value since it's
  the "smart" part of the app.
- Balance-sync trigger: must be tested for all 7 transaction types plus edit
  and delete (see `PRODUCTION_READY_CHECKLIST.md`).
- Manual test checklist: see `PRODUCTION_READY_CHECKLIST.md`.

## 6. Common Gotchas

- **Balance drift**: never edit `accounts.balance` directly — the sync trigger keeps it in sync with `transactions`. Account opening balances are created as `income` transactions so the trigger applies them.
- **SDK mismatch**: Expo Go on your phone must match the project SDK (57). Otherwise you get "Project is incompatible with this version of Expo Go."
- **Session pooler vs transaction pooler**: use the **session** pooler (`:5432`) so `BEGIN/COMMIT` works for multi-statement writes (e.g. account plus opening-balance transaction, receipt save). Transaction-pooler URLs (`:6543`) are rejected at startup — a connection that times out at start with a driver error usually means the wrong pooler port.
- **IPv6-only hosts**: if a direct `.supabase.co:5432` connection times out on a Windows host, switch `MASTER_DATABASE_URL` to the IPv4 pooler.
- **API URL**: the phone reaches the API at the URL in `EXPO_PUBLIC_API_URL`; regenerate it if the machine IP changes. For a standalone APK/IPA build the URL is inlined at build time (see README).
