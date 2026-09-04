# Development Guide

## Prerequisites

- Node.js 18+ (`node --version`)
- npm (`npm --version`)
- Expo Go app on your device (iOS App Store / Android Play Store), or an emulator
- A Supabase project (free tier is enough for family-scale use)
- A device with a camera (for testing receipt scan; emulator camera can use a virtual scene or webcam passthrough)

## 1. Clone & Install

```bash
git clone <repo-url> family-cashflow-app
cd family-cashflow-app/family-cashflow
npm install
```

## 2. Supabase Setup

1. Create a new Supabase project at supabase.com.
2. In the SQL editor, run in order:
   - `../schema.sql` — creates all tables
   - `../supabase/rls_policies.sql` — locks every table to household membership
   - `../supabase/triggers.sql` — balance sync + saving/investment rollup triggers
3. Enable Realtime on: `transactions`, `accounts`, `budgets` (Database → Replication in Supabase dashboard).
4. Create a Storage bucket named `receipts` (the RLS policies in `rls_policies.sql` already cover it, scoped by the household-id folder in the object path: `receipts/{household_id}/...`).
5. Deploy the Edge Functions:
   ```bash
   supabase functions deploy monthly-net-worth-snapshot
   supabase functions deploy budget-threshold-check
   ```
   Set `SUPABASE_SERVICE_ROLE_KEY` as a function secret for both (Dashboard → Edge Functions → Secrets) — this is required since they write to tables regular clients can't.
6. Wire up scheduling:
   - `monthly-net-worth-snapshot`: schedule via Dashboard → Database → Cron Jobs (or pg_cron) to call the function URL on the 1st of each month.
   - `budget-threshold-check`: create a Database Webhook (Dashboard → Database → Webhooks) on `INSERT` to `transactions` calling this function's URL.
7. Copy your project URL and anon key from Settings → API.

## 3. Configure Supabase Credentials

The app reads Supabase credentials from environment variables prefixed with `EXPO_PUBLIC_`. Create a `.env` file in the project root (the `family-cashflow/` folder):

```bash
cp .env.example .env
```

Fill in:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

EXPO_PUBLIC_ variables are inlined at build time by Expo — no server-side secrets, safe to use for the anon key.

## 4. Add Default Categories (one-time)

After creating your household, add the default income/expense categories — either through a supabase function or via the `src/constants/categories.ts` defaults. (An automated seed is planned; for now add categories in the app or dashboard.)

## 5. Running with Expo Go

```bash
npm start        # starts Expo dev server
npm run android  # or iOS
```

Then scan the QR code with the Expo Go app on your device (same Wi-Fi network) or press `a`/`i` for an emulator.

## 6. Project Structure

```
family-cashflow/
  App.tsx                     # entry — auth state gate (session → household → main)
  app.json                    # Expo config (plugins, permissions, extra env)
  .env                        # EXPO_PUBLIC_* Supabase credentials (git-ignored)
  .env.example
  src/
    core/theme.ts             # colors, spacing, typography tokens
    constants/                # config + category/transaction-type constants
    models/index.ts           # TS interfaces mirroring Postgres tables
    services/
      supabase.ts             # Supabase client (AsyncStorage persistence)
      authService.ts          # sign up/in/out, household create/join, members
      transactionService.ts   # accounts, categories, transactions CRUD
      categorization_service.ts  # (Phase 2) dictionary matching + fuzzy logic
      ocr_service.ts          # (Phase 2) ML Kit-style OCR parsing
    screens/
      auth/                   # AuthScreen, HouseholdOnboardingScreen
      dashboard/
      transactions/           # TransactionsScreen, AddTransactionScreen
      scan-receipt/
      budgets/
      net-worth/
      reports/
      household/
    navigation/AppNavigator.tsx  # tab + stack navigation
    widgets/                  # shared UI components
    hooks/                    # shared hooks
    utils/
```

## 7. Testing

- Unit tests (Jest): categorization matching logic (dictionary + fuzzy match) — highest value to test since it's the "smart" part of the app.
- Component tests (React Native Testing Library): confirm screen (editing categories, saving).
- Manual test checklist: see `PRODUCTION_READY_CHECKLIST.md`.

## 8. Common Gotchas

- **Balance drift**: if you manually edit `accounts.balance` in the Supabase dashboard while testing, it'll fall out of sync — always go through transactions, or reset via a fresh trigger run.
- **RLS lockout during dev**: if queries silently return empty results, check RLS policies before assuming a code bug — this is the most common "why is my data missing" issue with Supabase.
- **OCR accuracy varies by lighting/receipt condition** — test with a range of real family receipts, not just clean printed ones.
- **EXPO_PUBLIC_ vars are baked at build time** — restart `npm start` after changing `.env`.
