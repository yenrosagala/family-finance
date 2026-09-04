# Feature Checklist

Status legend: ⬜ not started · 🟨 in progress · ✅ done

## Phase 1 — MVP (core loop working)

- ✅ Auth (sign up / login via custom JWT + `app_users`, bcrypt) — backend `/api/auth`, `authService.ts`
- ✅ Household creation + invite code join flow — backend `/api/household` (+`/join`), `HouseholdOnboardingScreen`
- ✅ Household member management UI — `HouseholdMembersScreen` (invite code copy + member list) under More
- ✅ Accounts CRUD (cash/bank/e-wallet/credit card) with opening balance + Manage Accounts screen
- ✅ Categories CRUD + default category seed set + Manage Categories screen
- ✅ Manual transaction entry (amount-first form), types: income/expense
- 🟨 Transactions list (grouped by date, filterable) — list + delete exist; date grouping polish pending
- ✅ Dashboard v1: net cashflow, income/expense totals, category donut chart
- ✅ Account balance sync trigger (Postgres) — 7 transaction types
- ✅ RLS policies covering all core tables (`supabase/rls_policies.sql`)
- ⬜ Cross-account/user verification of RLS + role permissions (see PRODUCTION_READY_CHECKLIST)

## Phase 2 — Receipt Scanning

- 🟨 Camera capture + OCR integration from device (adapter + mock ready; real camera/OCR wiring pending device testing)
- ✅ Receipt parsing (merchant, date, total, line items) — backend `POST /api/receipt/parse`
- ✅ Global default item dictionary (bundled JSON, common Indonesian retail items) — seeded into every household
- ✅ Household item dictionary + exact/fuzzy matching — backend `/api/categorize` + `categorizationService.ts`
- ✅ Confirm screen (editable categories, confidence indicators) — `ConfirmReceiptScreen.tsx`, no auto-save
- ✅ Auto-dedupe exact consecutive duplicate OCR lines / token lines
- ✅ Reconciliation check (line items sum vs printed total)
- ✅ Duplicate-receipt fingerprint check + warning
- ✅ Correction feedback loop (updates item_dictionary confidence/counts) — `/api/categorize/correction`
- ✅ ML category classifier (Naive Bayes) as extra signal in the categorize pipeline — `api/src/ml/classifier.js`, fires before fallback when confident (margin ≥ 0.35); trains from global + household dictionary weighted by confirm/correction counts, unit-tested (`node --test`)
- ⬜ Receipt image storage (hosted Supabase Storage, household-scoped)

## Phase 3 — Budgeting

- ✅ Budget CRUD (per category, monthly limit, recurring/one-off) — backend `/api/budgets` + `BudgetsScreen`
- ✅ Budget progress bars on dedicated Budgets screen (spent/limit, over-budget state, month navigation)
- ✅ Dashboard budget-health strip (on-track / near-limit / over counts)
- ✅ Inline budget-impact hint on transaction entry (shows spent/limit when an expense category has a budget)
- ⬜ Budget threshold notifications (80%, 100% — scheduled/triggered job)
- ⬜ Suggested budgets based on historical spend

## Phase 4 — Transfers, Saving, Investing

- ✅ Transaction type picker (income/expense/transfer/invest/save UI) + goal/investment selection
- ✅ Internal transfer flow (from/to account)
- ✅ External transfer flow (transfer_out/transfer_in, to_person field)
- ✅ Saving goals CRUD + contribution flow + progress display — `SavingGoalsScreen` + `/api/saving-goals`; `current_amount` maintained by trigger
- ✅ Investments CRUD + contribution flow + manual value updates — `InvestmentsScreen` + `/api/investments`; `total_invested` maintained by trigger
- ✅ Dashboard "saved & invested this month" section (summary returns `saved`/`invested`)

## Phase 5 — Net Worth & Reports

- ⬜ Assets/liabilities CRUD (property, vehicles, loans, etc.)
- ⬜ Net worth screen: total, trend chart, assets/liabilities breakdown
- ⬜ Monthly net worth snapshot scheduled job
- ⬜ Reports screen: Income Statement (P&L) view, date range picker
- ⬜ Reports screen: Balance Sheet view
- ⬜ Period comparison mode (this month vs last month)
- ⬜ PDF export of statements

## Phase 6 — Polish & Family Features

- ✅ Household member management (roles, remove member) — added `DELETE /api/household/members/:user_id` endpoint
- ✅ Per-member spending breakdown — added `GET /api/household/members/spending` endpoint
- ⬜ Push notifications setup (FCM token registration)
- ⬜ Monthly asset-update reminder notification
- ⬜ Offline write queue (if gaps prove painful in real use)
- ✅ Search across transactions — added `search` query parameter to `GET /api/transactions`
- ⬜ CSV export
- ✅ Indonesian-style number formatting (dot thousands separator, `1.500.000`) via `core/format.ts` `formatMoney()`, applied across all money-display screens

## Explicitly Deferred / Non-goals

- Bank account auto-sync / Open Banking
- Multi-currency support
- Tax-specific reporting
- Multi-tenant commercial scaling considerations
