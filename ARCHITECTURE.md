# Architecture — Family Cash Flow App

## 1. High-Level Overview

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Flutter Client     │        │        Supabase           │
│  (Android/iOS)       │◄──────►│  Postgres + Auth + Storage │
│                      │  REST/  │  + Realtime + Edge Fns    │
│  - ML Kit OCR (local)│  WS     │                            │
│  - Local dictionary  │        │                            │
│    matching cache    │        │                            │
└─────────────────────┘        └──────────────────────────┘
```

- **Client does OCR + first-pass categorization locally** (offline-capable). Only confirmed transactions sync to Supabase.
- **Supabase is the single source of truth** for shared household data — all family members read/write the same tables, scoped by Row Level Security (RLS).
- **Realtime subscriptions** push live updates to the dashboard when any family member adds/edits a transaction.

## 2. Data Model

See `schema.sql` (Postgres DDL) for the authoritative schema. Summary of tables:

- `households`, `household_members` — the shared unit and its people.
- `accounts` — cash/bank/e-wallet/credit card; `balance` kept in sync via trigger.
- `categories` — income/expense categories, household-customizable.
- `transactions` — the core ledger. 7 types: `income`, `expense`, `transfer`, `transfer_out`, `transfer_in`, `investment`, `saving`.
- `transaction_line_items` — per-item breakdown from receipt scans (subtable, queryable across receipts).
- `item_dictionary` — household-learned keyword → category mappings, powers auto-categorization.
- `budgets`, `saving_goals`, `investments`, `assets`, `liabilities` — supporting financial structures.
- `net_worth_snapshots` — monthly computed snapshot, written by a scheduled job only.

### Why 7 transaction types

Internal money movement (transfer, investment, saving) must never be counted in `income − expense` net cashflow, or the number lies. Only `income` and `expense` touch the P&L view. `transfer_out`/`transfer_in` (external parties) are tracked separately from internal transfers since they're a different economic event (money actually leaves/enters the household).

## 3. Receipt Scan → Categorization Pipeline

```
1. Camera capture (Flutter camera plugin)
2. ML Kit Text Recognition → raw text blocks (on-device, offline)
3. Parse: merchant name, date, total, line items (regex + heuristics)
4. Auto-dedupe exact consecutive duplicate lines (OCR artifact correction)
5. Per line item, normalize text and match against:
     a. household item_dictionary (exact match)
     b. household item_dictionary (fuzzy match, e.g. trigram/Levenshtein)
     c. global default dictionary (bundled JSON asset)
     d. fallback: "Uncategorized", flagged for review
6. Reconciliation check: sum(line items) vs printed total → warn on mismatch
7. Duplicate-receipt check: hash(merchant + total + date + item_count) against
   recent transactions in the household → warn if a likely duplicate exists
8. Present confirm screen — user edits/approves before anything is saved
9. On save:
     - Insert transaction + line_items
     - Update item_dictionary confidence/counts based on confirms/corrections
     - Trigger updates account balance
```

**Nothing from a scan is saved silently.** The confirm screen is mandatory — OCR and categorization are both probabilistic and will sometimes be wrong.

## 4. Backend Logic (Supabase)

### Triggers (Postgres, run on every transaction write)
- **Balance sync trigger**: on `INSERT/UPDATE/DELETE` of `transactions`, adjust the relevant `accounts.balance` atomically based on `type` and `from/to_account_id`. See `ARCHITECTURE-ESSENTIALS.md` for the balance-delta table.

### Scheduled jobs (pg_cron or Edge Function cron)
- **Monthly net worth snapshot**: sums `accounts.balance + investments.current_value + assets.current_value − liabilities.current_balance` per household, writes to `net_worth_snapshots`.
- **Budget threshold check**: on expense insert, compare category's month-to-date spend against `budgets.monthly_limit`; send push notification at 80% and 100% crossings only (not every transaction after).

### Row Level Security
All tables scoped to `household_id`, checked against `household_members` for the requesting `auth.uid()`. See `SECURITY.md`-equivalent section in `PRODUCTION_READY_CHECKLIST.md`.

## 5. Double-Counting Safeguards (summary)

| Risk | Safeguard |
|---|---|
| Same receipt scanned twice | `receipt_fingerprint` hash check against recent transactions |
| OCR duplicates a line item | Auto-dedupe exact consecutive duplicate lines pre-confirm |
| Line items don't sum to total | Reconciliation warning on confirm screen |
| Saving goal counted as both account balance AND separate asset | Saving goals are a *label* on a linked account, not a separate net-worth bucket |
| Internal transfer counted as expense/income | Transfers use dedicated `transfer` type, excluded from P&L aggregation |

## 6. Client-Side State & Offline Behavior

- Supabase client SDK handles auth session persistence.
- For offline-first behavior beyond Supabase's default (queue writes while offline), consider a local queue table (e.g. `sqflite`) that replays pending transactions on reconnect — **not built in v1**, flagged as a v2 enhancement if offline gaps prove painful in practice.
- Dashboard subscribes to Realtime changes on `transactions`, `accounts`, `budgets` for the household — updates push to all members' devices live.

## 7. Non-Functional Requirements

- **Privacy:** receipt images and OCR text never leave the device except the final confirmed transaction data + optionally the receipt image (stored in Supabase Storage, household-scoped bucket).
- **Offline tolerance:** manual entry and receipt scanning must work with no network; sync resumes when back online.
- **Performance:** dashboard should load from a single aggregating query per section (avoid N+1 queries against `transactions`).
