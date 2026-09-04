# Agent Instructions

Instructions for AI coding agents (Claude Code, Cursor, etc.) working in this repository.

## Before Making Changes

1. Read `ARCHITECTURE-ESSENTIALS.md` first — it has the transaction-type/balance-effect table and categorization order that everything else depends on. Don't guess at these; get them from that file.
2. Read `schema.sql` for the authoritative data model. Do not invent new columns or tables without updating `schema.sql` and `ARCHITECTURE.md` in the same change.
3. Check `FEATURE_CHECKLIST.md` to see what phase is currently active — don't build Phase 4 features while Phase 1 is incomplete unless explicitly asked.
4. Backend logic already exists and should not be reimplemented from scratch:
   - `supabase/rls_policies.sql` — every table's access control
   - `supabase/triggers.sql` — account balance sync + saving/investment rollup
   - `supabase/functions/monthly-net-worth-snapshot/` — scheduled net worth calc
   - `supabase/functions/budget-threshold-check/` — webhook-triggered budget alerts
   If a new table or transaction-affecting field is added, these files must be updated to match, not bypassed with client-side logic.

## Non-Negotiable Rules

- **Never let a transaction type other than `income` or `expense` affect net cashflow/P&L calculations.** Transfers, investments, and savings move money within the household's own control — they are not gains or losses. If you write an aggregation query for dashboard totals or reports, it MUST filter `type IN ('income', 'expense')` unless explicitly computing something else (like "total saved this month").
- **Never auto-save a scanned receipt without user confirmation.** OCR output and categorization are both probabilistic. Every receipt scan flow must land on a confirm/edit screen before any database write.
- **Saving goals are not a separate net-worth asset bucket.** They're a label over a `linked_account_id` whose balance is already counted. Do not add saving goal `current_amount` on top of account balances when computing net worth — that double-counts.
- **All new tables need RLS policies in the same change that creates them.** No table should ever be created without also writing its household-scoped RLS policy.
- **Balance changes only happen via the sync trigger, never via direct client-side balance writes.** If a feature seems to need directly setting `accounts.balance`, that's a sign the transaction model is being bypassed — flag it instead of implementing it.

## Code Style / Structure

- Follow the `lib/` structure proposed in `DEVELOPMENT.md` (`core/`, `models/`, `services/`, `screens/`, `widgets/`) — place new files accordingly rather than creating ad-hoc top-level folders.
- Categorization/matching logic (dictionary + fuzzy match) lives in `services/categorization_service.dart` — keep OCR parsing (`ocr_service.dart`) separate from categorization logic so each can be tested independently.
- Prefer Postgres for aggregation logic (SUM/GROUP BY for reports, net worth) over pulling all rows and computing client-side — this was a deliberate reason for choosing Supabase over Firestore.

## When Adding a Feature

1. Check if it's already listed in `FEATURE_CHECKLIST.md`. If yes, update its status as you work. If no, add it under the appropriate phase.
2. If it changes the data model, update `schema.sql`, `ARCHITECTURE.md`, and `ARCHITECTURE-ESSENTIALS.md` together — these three must never drift out of sync.
3. If it touches money movement (new transaction type, new balance-affecting field), update the balance-effect table in `ARCHITECTURE-ESSENTIALS.md` and the trigger logic, and add a row to `PRODUCTION_READY_CHECKLIST.md` under Data Integrity.

## Testing Expectations

- Any change to categorization matching logic needs a unit test covering: exact match, fuzzy match, fallback to global dictionary, fallback to "Uncategorized."
- Any change to the balance-sync trigger needs a test covering all 7 transaction types, plus edit and delete (not just insert).
