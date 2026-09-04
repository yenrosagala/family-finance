# Development Guide

## Overview

This repo is two parts:

- **`family-cashflow/`** — Expo SDK 57 / React Native client (TypeScript), runs in Expo Go.
- **`api/`** — Node.js / Express API bridge that the client talks to. It connects to a **hosted Supabase Postgres** database (via the session pooler) and scopes all queries by `household_id` in code.

There is no direct Supabase JS client or Edge Function dependency in the current client; the `supabase/` folder (RLS, triggers, functions) is retained for production hardening and when moving off the superuser-bypass pattern.

## Prerequisites

- Node.js 18+ (`node --version`)
- npm (`npm --version`)
- Expo Go app on your device (iOS App Store / Android Play Store), or an emulator
- A hosted Supabase project (free tier is enough for family-scale use)
- A device with a camera (for testing receipt scan)

## 1. Set Up the Database

The API connects to a hosted Supabase Postgres database using the **session pooler** (port 6543), because the account-balance sync trigger relies on `BEGIN/COMMIT` which the transaction pooler breaks.

1. Create a Supabase project at supabase.com.
2. In the SQL editor, run in order:
   - `schema.sql` — creates all tables
   - `supabase/rls_policies.sql` — locks every table to household membership
   - `supabase/triggers.sql` — balance sync + saving/investment rollup triggers
3. Get the **session pooler** connection string: Supabase dashboard → Project Settings → Database → Connection string, and choose the pooler port 6543.
   - Format: `postgres://<user>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

> Note: the API currently connects as the database superuser (`postgres`) and bypasses RLS, scoping in code by `household_id`. Before production you should switch to role-based DB access so RLS is the enforcement layer. See `PRODUCTION_READY_CHECKLIST.md`.

## 2. Run the API

```bash
cd api
npm install
cp .env.example .env
```

Fill in `api/.env`:
```
PORT=4000
DATABASE_URL=postgres://USER:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres
JWT_SECRET=<long-random-secret>
```

Then start it:
```bash
npm start          # Express API on http://localhost:4000
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

The client talks to the API at `http://<your-LAN-IP>:4000` — the base URL is configured in `src/services/api.ts` (`API_BASE_URL`). Point it at the machine running the API.

> If you change the Expo SDK version, restart the dev server with `--clear` and make sure the installed **Expo Go** app on your phone matches the SDK (e.g. SDK 57). A mismatch shows "Project is incompatible with this version of Expo Go / failed to download remote update."

## 4. Project Structure

```
family-cashflow/              # Expo / React Native client
  App.tsx                     # entry - auth state gate (session -> household -> main)
  app.json                    # Expo config (plugins, permissions, icons, name/slug)
  src/
    core/theme.ts             # colors, spacing, typography tokens
    constants/                # config + category/transaction-type constants, dictionary.json
    models/index.ts           # TS interfaces mirroring Postgres tables
    services/
      api.ts                  # HTTP client + token storage + base URL
      authService.ts          # sign up/in/out, household create/join, members
      transactionService.ts   # accounts (incl. opening balance), categories, transactions
      categorizationService.ts# dictionary matching + fuzzy logic
      receiptService.ts       # OCR adapter + parsing helpers
    screens/
      auth/                   # AuthScreen, HouseholdOnboardingScreen
      dashboard/              # DashboardScreen
      transactions/           # TransactionsScreen, AddTransactionScreen
      receipts/               # ScanScreen, ConfirmReceiptScreen
      more/                   # MoreScreen, ManageAccountsScreen, ManageCategoriesScreen, HouseholdMembersScreen
    navigation/AppNavigator.tsx  # tab + stack navigation
    widgets/                  # shared UI components (e.g. CategoryDonut)
api/                          # Express backend
  src/
    server.js                 # app wiring, route mounting
    auth.js                   # JWT sign/verify middleware
    db.js                     # Postgres pool (from DATABASE_URL)
    data/globalDictionary.js  # global Indonesian item dictionary seed
    routes/                   # auth, household, accounts, categories, transactions, categorize, receipt, dictionary
  .env                        # git-ignored; PORT, DATABASE_URL, JWT_SECRET
  seed-demo.js                # demo user + household seed
schema.sql                    # authoritative Postgres data model
supabase/                     # RLS policies, triggers, Edge Functions (hardening)
```

## 5. Testing

- Unit tests (Jest): categorization matching logic (dictionary + fuzzy match) — highest value since it's the "smart" part of the app.
- Component tests (React Native Testing Library): confirm screen (editing categories, saving).
- Manual test checklist: see `PRODUCTION_READY_CHECKLIST.md`.

## 6. Common Gotchas

- **Balance drift**: never edit `accounts.balance` directly — the sync trigger keeps it in sync with `transactions`. Account opening balances are created as `income` transactions so the trigger applies them.
- **SDK mismatch**: Expo Go on your phone must match the project SDK (57). Otherwise you get "Project is incompatible with this version of Expo Go."
- **Session pooler vs transaction pooler**: use the session pooler (6543) so `BEGIN/COMMIT` works for multi-statement writes (e.g. account plus opening-balance transaction, receipt save).
- **IPv6-only hosts**: if a direct `.supabase.co:5432` connection times out on a Windows host, switch `DATABASE_URL` to the pooler over IPv4.
- **LAN IP**: the phone reaches the API at the PC's LAN IP; regenerate the base URL in `src/services/api.ts` if the IP changes.
