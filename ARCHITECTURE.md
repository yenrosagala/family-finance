# Architecture — FamFin Family Finance Management

## 1. High-Level Overview

```
┌──────────────────────────┐        ┌──────────────────────────┐        ┌────────────────────────────┐
│    Expo / React Native    │  HTTP  │      Express API          │  SQL   │    Hosted Supabase Postgres  │
│        Client (TS)        │◄──────►│        (api/)             │◄──────►│      (session pooler)        │
│                           │  JSON   │  - auth (JWT)             │        │  - authoritative data model  │
│  SDK 57 · Expo Go · src/  │         │  - household/account/...  │        │  - balance-sync triggers     │
└──────────────────────────┘        └──────────────────────────┘        └────────────────────────────┘
```

- **The client has no direct Postgres/Supabase access.** It talks only to the Express API over JSON.
- **The API is the single backend**: authenticates users (custom JWT vs `app_users`), and scopes every query by `household_id` in code.
- **The DB is authoritative for financial logic**: the account-balance sync trigger and (future) aggregations run in Postgres.
- **OCR + first-pass categorization** happen client-side (adapter ready), but the server re-runs categorization authoritatively.

## 2. Auth

- `app_users` table (`email`, `password_hash` bcrypt, `display_name`), seeded/created via `POST /api/auth/register`.
- `POST /api/auth/login` verifies bcrypt and returns a signed JWT (`JWT_SECRET`).
- All `/api` routes except register/login require the JWT (`authRequired` middleware).
- Household membership is derived from `household_members`; most routes resolve the caller's `household_id` from there and filter every query by it.

## 3. Data Model

See `schema.sql` (Postgres DDL) for the authoritative schema. Summary of tables:

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
1. Camera capture (Expo Camera) — real capture/OCR wiring pending device testing
2. Text recognition → raw text blocks (on-device intent; OCR adapter is swappable)
3. Parse: merchant name, date, total, line items (regex + heuristics)
4. Auto-dedupe exact consecutive duplicate lines (OCR artifact correction)
5. Per line item, normalize text and match against:
     a. household item_dictionary (exact match)
     b. household item_dictionary (fuzzy match)
     c. global default dictionary (bundled JSON asset)
     d. fallback: "Uncategorized", flagged for review
6. Reconciliation check: sum(line items) vs printed total → warn on mismatch
7. Duplicate-receipt check: hash(merchant + total + date + item_count) against
   recent household transactions → warn if a likely duplicate exists
8. Present confirm screen — user edits/approves before anything is saved
9. On save (`POST /api/receipt/save`):
     - Insert transaction + line_items in one DB transaction
     - Update item_dictionary confidence/counts based on confirms/corrections
     - Trigger updates account balance
```

**Nothing from a scan is saved silently.** The confirm screen is mandatory — OCR and categorization are both probabilistic and will sometimes be wrong.

## 5. Backend Logic

### Express API routes (`api/src/routes/`)
- `auth` — register / login / me
- `household` — get/create/join, members list
- `accounts` — list/create (with opening balance)/soft-delete
- `categories` — list/create
- `transactions` — list/create/delete, `summary` (income/expense/net), `breakdown` (per-category donut)
- `categorize` — `POST /api/categorize` (exact → fuzzy → global → fallback), `/categorize/correction` (learning loop)
- `receipt` — `POST /api/receipt/parse`, `POST /api/receipt/save`
- `dictionary` — household dictionary CRUD + bulk

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
- For offline-first behavior beyond the API (queue writes while offline), a local write queue is a **v2 enhancement** (Phase 6) — not built yet.
- Live multi-device updates are not yet wired (no realtime/websocket yet); refreshing the dashboard reloads from the API.

## 8. Non-Functional Requirements

- **Privacy:** receipt images and OCR text ideally never leave the device except the final confirmed transaction data (+ optionally a stored receipt image in household-scoped storage).
- **Offline tolerance:** manual entry and receipt scanning should work with no network; sync resumes when back online (Phase 6).
- **Performance:** dashboard loads from aggregating queries (`summary`/`breakdown`) rather than pulling all rows — Prefer Postgres aggregation, a deliberate reason for choosing SQL over Firestore.
