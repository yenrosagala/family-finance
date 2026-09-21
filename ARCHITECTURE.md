# Architecture — FamFin Family Finance Management

## 1. High-Level Overview

```
┌──────────────────────────┐        ┌──────────────────────────┐        ┌────────────────────────────┐
│    Expo / React Native    │  HTTP  │      Express API          │  SQL   │    Hosted Supabase Postgres  │
│        Client (TS)        │◄──────►│        (api/)             │◄──────►│      (session pooler)        │
│                           │  JSON   │  - auth (JWT)             │        │  - master DB + per-household │
│  SDK 57 · Expo Go · src/  │         │  - tenant scoping         │        │    schemas (hh_*)            │
└──────────────────────────┘        └──────────────────────────┘        └────────────────────────────┘
```

- **The client has no direct Postgres/Supabase access.** It talks only to the Express API over JSON.
- **The API is the single backend**: authenticates users (custom JWT vs `app_users` in the master DB), then `tenantMiddleware` resolves each user's household and routes every query to that household's dedicated Postgres schema (`req.householdDb` via `db.js`, search_path pinned). Household financial data never coexists in one shared pool of tables.
- **The DB is authoritative for financial logic**: the account-balance sync trigger and (future) aggregations run in Postgres per household schema.
- **OCR runs server-side** (`ocr_service/`, PaddleOCR-VL) and is proxied by `POST /api/receipt/ocr`; parsing + categorization run in the API (`POST /api/receipt/parse`, `categorizeText.js`). The client has no receipt-scan screens — the scan flow and its mandatory confirm step are not currently wired in the mobile UI.
- **Each new user chooses their data source at sign-up** (`src/core/dataSource.ts`): **Cloud** — the Supabase topology above, or **Local** — an on-device SQLite mirror (`src/services/local/database.ts` + `repository.ts`) that implements the same core loop (auth, household, accounts, categories, transactions with the same balance-effect semantics, summaries, net worth) against a device-only DB, so the household data never leaves the phone. Local mode also covers budgets, saving goals, investments, and reports/export; assets/liabilities, cloud OCR, and cross-device sharing are cloud-only. Local mode is not available on web. Balance-effect semantics are mirrored 1:1 from the Postgres sync trigger (see §6 table).

## 2. Auth

- **Master DB** (`public` schema, `master-schema.sql`) holds `app_users` (`email`, `password_hash` bcrypt, `display_name`, `household_id`, `role`) and `households_registry` (household name, invite code, `db_url`, `schema_name`). Seeded via `POST /api/auth/register`.
- `POST /api/auth/login` verifies bcrypt against the master DB and returns a signed JWT (`JWT_SECRET`).
- All `/api` routes except register/login require the JWT; `tenantMiddleware` verifies it, looks up `app_users JOIN households_registry` in the master DB, and attaches `req.householdDb` (a Pool pinned to that household's schema) + `req.householdId` + `req.user`.
- Each household's own schema also mirrors `app_users`, `households`, `household_members` for same-schema joins (kept in sync at register/join).

## 3. Data Model

**Two schemas, two files:** the master DB is defined by `api/src/db/master-schema.sql` (run once); every household schema is provisioned at register time from `api/src/db/schema.sql` inside a fresh `hh_<slug>_<suffix>` namespace (`api/src/services/provision.js`). Summary of the per-household tables:

- `households`, `household_members` — the shared unit and its people (roles: admin/member).
- `accounts` — cash/bank/e-wallet/credit card; `balance` kept in sync via trigger. Creating an account may carry an **opening balance**, which is recorded as an `income` transaction (category "Opening Balance") so the trigger applies it.
- `categories` — income/expense categories, household-customizable.
- `transactions` — the core ledger. 7 types: `income`, `expense`, `transfer`, `transfer_out`, `transfer_in`, `investment`, `saving`.
- `transaction_line_items` — per-item breakdown from receipt scans (subtable, queryable across receipts).
- `item_dictionary` — household-learned keyword → category mappings, powers auto-categorization.
- `budgets`, `saving_goals`, `investments`, `assets`, `liabilities` — supporting financial structures (Phases 3–5).
- `net_worth_snapshots` — monthly computed snapshot, written by a scheduled job only (Phase 5).

### Why 7 transaction types

Internal money movement (transfer, investment, saving) must never be counted in `income − expense` net cashflow, or the number lies. Only `income` and `expense` touch the P&L view. `transfer_out`/`transfer_in` (external parties) are tracked separately from internal transfers since they're a different economic event (money actually leaves/enters the household).

## 4. Receipt Scan → Categorization Pipeline

```
1. Image capture — on-device camera not wired in the current client; image arrives as base64 (future/API clients)
2. OCR → server-side PaddleOCR-VL service (`ocr_service/`), proxied unauthenticated by `POST /api/receipt/ocr` (photo → text)
3. Parse in API: merchant name, date, total, line items (regex + heuristics) — `POST /api/receipt/parse`
4. Auto-dedupe exact consecutive duplicate lines (OCR artifact correction)
5. Per line item, normalize text and match against:
     a. household item_dictionary (exact match)
     b. household item_dictionary (fuzzy match, top-100 by confidence, score ≥ 0.6)
     c. fallback: "Uncategorized", flagged for review
6. Reconciliation check: sum(line items) vs printed total → warn on mismatch
7. Duplicate-receipt check: hash(merchant + total + date + item_count) against
   recent household transactions → warn if a likely duplicate exists
8. Confirm step — user edits/approves before anything is saved (UI not wired client-side yet)
9. On save (`POST /api/receipt/save`):
     - Insert transaction + line_items in one DB transaction
     - Update item_dictionary confidence/counts based on confirms/corrections
     - Trigger updates account balance
```

**Nothing from a scan is saved silently.** The confirm step is mandatory — OCR and categorization are both probabilistic and will sometimes be wrong.

## 5. Backend Logic

### Express API routes (`api/src/routes/`)
- `auth` — register (creates household + schema) / join via invite / login / me
- `household` — get info, members list, remove member, per-member spending, invite-code refresh
- `accounts` — list/create (with opening balance)/soft-delete
- `categories` — list/create
- `transactions` — list/create/delete; `summary` (income/expense/net cashflow + `saved`/`invested`), `breakdown` (per-category donut), `search`
- `categorize` — `POST /api/categorize` (exact → fuzzy → fallback via `services/categorizeText.js`), `/categorize/correction` (learning loop)
- `receipt` — `POST /api/receipt/ocr` (proxy), `POST /api/receipt/parse`, `POST /api/receipt/save`
- `dictionary` — household dictionary CRUD + bulk
- `budgets` — `GET /api/budgets?month=YYYY-MM` (each budget w/ month-to-date `spent` via correlated subquery), `POST`, `PUT /:id`, `DELETE /:id`
- `saving-goals` — CRUD; `current_amount` maintained by the goal/investment rollup trigger (never written directly)
- `investments` — CRUD + manual mark-to-market (`current_value`); `total_invested` maintained by the rollup trigger
- `assets`, `liabilities` — net-worth supporting structures CRUD
- `net-worth` — totals + snapshot history
- `reports` — `GET /pl`, `/balance-sheet`, `/compare`, `/export` (XLSX/PDF monthly statement)

Isolation: `server.js` mounts everything except `/api/auth` behind `tenantMiddleware` (JWT verify → master-DB household lookup → `req.householdDb`). `/api/receipt/ocr` is stateless and intentionally skips tenant/auth (no household data written).

### Triggers (Postgres, run on every transaction write)
- **Balance sync trigger** (`supabase/triggers.sql`): on `INSERT/UPDATE/DELETE` of `transactions`, adjust the relevant `accounts.balance` atomically based on `type` and `from/to_account_id`. See `ARCHITECTURE-ESSENTIALS.md` for the balance-delta table. This is the only path that changes `accounts.balance`.

### Future jobs (kept in `supabase/functions/` for hardening)
- **Monthly net worth snapshot**: sums `accounts.balance + investments.current_value + assets.current_value − liabilities.current_balance` per household, writes to `net_worth_snapshots`.
- **Budget threshold check**: on expense insert, compare category's month-to-date spend against `budgets.monthly_limit`; notify at 80% and 100% crossings only.

### Row Level Security
Today the API connects as the DB superuser and enforces scoping in code. All tables still have `household_id`-scoped RLS policies written in `supabase/rls_policies.sql`. Before production, switch to a least-privilege DB role so RLS (not just app code) enforces access, and verify the cross-household tests in `PRODUCTION_READY_CHECKLIST.md`.

## 6. Double-Counting Safeguards (summary)

| Risk | Safeguard |
|---|---|
| Same receipt scanned twice | `receipt_fingerprint` hash check against recent transactions |
| OCR duplicates a line item | Auto-dedupe exact consecutive duplicate lines pre-confirm |
| Line items don't sum to total | Reconciliation warning on confirm screen |
| Saving goal counted as both account balance AND separate asset | Saving goals are a *label* on a linked account, not a separate net-worth bucket |
| Internal transfer counted as expense/income | Transfers use dedicated `transfer` type, excluded from P&L aggregation |
| Account opening balance not applied / bypasses accounting | Opening balance is an `income` transaction → applied by the sync trigger; never a direct balance write |

## 7. Client-Side State & Offline Behavior

- JWT is persisted (expo-secure-store / AsyncStorage) in `src/services/api.ts`.
- **Two data-source modes** (chosen per user at sign-up in `AuthScreen.tsx`, persisted as `fcf_data_source`):
  - **Cloud** (default): everything goes through the Express API; online required. JWT + household scoping as described above.
  - **Local**: `src/services/*Service.ts` branch on `isLocalMode()` to the on-device SQLite repository (`services/local/`) instead of calling the API. Sessions live in AsyncStorage (`fcf_local_session`), passwords are hashed with salted SHA-256 (`expo-crypto`), ids are `Crypto.randomUUID()`, and account balances are applied by the repository's `applyBalanceDelta` (same rules as the Postgres sync trigger, including reverse-on-delete). Core loop (auth, household, accounts, categories, transactions, summaries, net worth) plus budgets, saving goals, investments, and the monthly-statement export (`buildLocalStatement`) work locally; **assets/liabilities, cloud OCR/receipts, and P&L/balance-sheet report views are unavailable in Local mode** and throw a friendly "not available in Local mode" error.
- Local mode data is **device-bound**: there is no cross-device household sharing or invite-join in local mode.
- For offline-first behavior in Cloud mode (queue writes while offline), a local write queue is a **v2 enhancement** (Phase 6) — not built yet.
- Live multi-device updates are not yet wired (no realtime/websocket yet); refreshing the dashboard reloads from the API.

## 8. Non-Functional Requirements

- **Privacy:** receipt images are sent to the API's OCR proxy (base64, 30 MB limit) and on to the `ocr_service/` PaddleOCR-VL worker; only the confirmed, parsed transaction data is stored. Optionally keep the receipt image in household-scoped storage (not yet built).
- **Offline tolerance:** manual entry and receipt scanning should work with no network; sync resumes when back online (Phase 6).
- **Performance:** dashboard loads from aggregating queries (`summary`/`breakdown`) rather than pulling all rows — Prefer Postgres aggregation, a deliberate reason for choosing SQL over Firestore.
