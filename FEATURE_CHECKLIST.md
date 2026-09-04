# Feature Checklist

Status legend: ⬜ not started · 🟨 in progress · ✅ done

## Phase 1 — MVP (core loop working)

- 🟨 Auth (sign up / login via Supabase Auth)
- 🟨 Household creation + invite code join flow
- 🟨 Accounts CRUD (cash/bank/e-wallet/credit card)
- 🟨 Categories CRUD + default category seed set
- 🟨 Manual transaction entry (amount-first form), types: income/expense
- 🟨 Transactions list (grouped by date, filterable)
- ⬜ Dashboard v1: net cashflow, income/expense totals, category donut chart
- ✅ Account balance sync trigger (Postgres)
- ✅ Basic RLS policies covering all core tables

## Phase 2 — Receipt Scanning

- ⬜ Camera capture + ML Kit OCR integration
- ⬜ Receipt parsing (merchant, date, total, line items)
- ⬜ Global default item dictionary (bundled JSON, common Indonesian retail items)
- ⬜ Household item dictionary + exact/fuzzy matching
- ⬜ Confirm screen (editable categories, confidence indicators)
- ⬜ Auto-dedupe exact consecutive duplicate OCR lines
- ⬜ Reconciliation check (line items sum vs printed total)
- ⬜ Duplicate-receipt fingerprint check + warning
- ⬜ Correction feedback loop (updates item_dictionary confidence/counts)
- ⬜ Receipt image storage (Supabase Storage, household-scoped)

## Phase 3 — Budgeting

- ⬜ Budget CRUD (per category, monthly limit, recurring/one-off)
- ⬜ Budget progress bars on dedicated Budgets screen
- ⬜ Dashboard budget-health strip
- ⬜ Inline budget-impact hint on transaction entry
- ⬜ Budget threshold notifications (80%, 100% — scheduled/triggered job)
- ⬜ Suggested budgets based on historical spend

## Phase 4 — Transfers, Saving, Investing

- ⬜ Transaction type picker (income/expense/transfer/invest/save UI)
- ⬜ Internal transfer flow (from/to account)
- ⬜ External transfer flow (transfer_out/transfer_in, to_person field)
- ⬜ Saving goals CRUD + contribution flow + progress display
- ⬜ Investments CRUD + contribution flow + manual value updates
- ⬜ Dashboard "saved & invested this month" section

## Phase 5 — Net Worth & Reports

- ⬜ Assets/liabilities CRUD (property, vehicles, loans, etc.)
- ⬜ Net worth screen: total, trend chart, assets/liabilities breakdown
- ⬜ Monthly net worth snapshot scheduled job
- ⬜ Reports screen: Income Statement (P&L) view, date range picker
- ⬜ Reports screen: Balance Sheet view
- ⬜ Period comparison mode (this month vs last month)
- ⬜ PDF export of statements

## Phase 6 — Polish & Family Features

- ⬜ Household member management (roles, remove member)
- ⬜ Per-member spending breakdown
- ⬜ Push notifications setup (FCM token registration)
- ⬜ Monthly asset-update reminder notification
- ⬜ Offline write queue (if gaps prove painful in real use)
- ⬜ Search across transactions
- ⬜ CSV export

## Explicitly Deferred / Non-goals

- Bank account auto-sync / Open Banking
- Multi-currency support
- Tax-specific reporting
- Multi-tenant commercial scaling considerations
