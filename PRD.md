# PRD — Family Cash Flow App

## 1. Problem

Families track money across scattered tools (notes apps, memory, bank apps that don't talk to each other) or not at all. Manual expense entry is tedious enough that people give up within weeks. There's no single place to see: how much did we spend this month, are we on budget, what's our net worth, and are we saving/investing enough.

## 2. Goal

A shared, low-friction family finance app where:
- Logging an expense takes seconds (ideally: snap a photo, confirm, done).
- Any family member can see the same live financial picture.
- The app answers three questions at a glance: *Are we overspending? What do we own vs owe? Are we making progress on savings/investing goals?*

## 3. Users

- **Primary:** a household (2+ adults) who share finances and want visibility into joint spending.
- **Usage pattern:** frequent small entries (daily/weekly receipts), occasional big-picture review (monthly budget/net worth check).

## 4. Core User Stories

1. As a family member, I can scan a receipt and have it categorized automatically, so I don't have to type every item.
2. As a family member, I can see a live dashboard of this month's income, expenses, and net cashflow.
3. As a family member, I can set a monthly budget per category and get warned before/when I go over.
4. As a family member, I can record transfers between our own accounts without it being counted as spending.
5. As a family member, I can log money moved into savings goals or investments, separate from expenses.
6. As a family, we can see our net worth (assets − liabilities) trend over time.
7. As a family, we can view a formatted income statement and balance sheet for any period.
8. As an admin, I can invite other family members into the household so data is shared, not siloed.

## 5. Non-goals (explicitly out of scope for v1)

- Bank account auto-sync/Open Banking integration (manual entry + receipt scan only).
- Multi-currency support beyond a single household default currency.
- Tax filing or tax-specific reporting.
- Public/commercial multi-tenant scaling (this is built for one family, architecture just happens to support more).

## 6. Key Product Decisions (already made, see chat history / ARCHITECTURE.md)

- **Expo / React Native** (TypeScript), cross-platform, Android-first, runs in Expo Go.
- **Express API bridge** (`api/`) in front of hosted **Supabase Postgres** — the client never talks to the DB directly; auth is a custom JWT against `app_users`.
- **On-device OCR** (Expo Camera) for privacy + offline use + zero API cost (adapter ready; real camera wiring pending device testing).
- **Postgres** backend — chosen over Firebase for relational fit (financial statements are SQL-shaped) and SQL aggregation for reports/net worth.
- **Category learning via dictionary + fuzzy match + user corrections**, not a trained ML model — avoids needing a labeled dataset upfront, fully explainable, works offline.
- **7 transaction types**: income, expense, transfer (internal), transfer_out/in (external), investment, saving — chosen so internal money movement never pollutes the income/expense net cashflow number.

## 7. Success Criteria (subjective, family-scale — not commercial metrics)

- A receipt can be scanned and confirmed in under 15 seconds.
- Dashboard net cashflow number is trustworthy (no double-counting from transfers/investments/savings).
- Household members actually keep using it past month 1 (the real failure mode for budgeting apps).
- Net worth and financial statements are accurate enough to replace an ad-hoc spreadsheet.

## 8. Open Questions

- Rollover budgets: on by default, or opt-in per category?
- Should saving goals allow contributions from multiple accounts, or lock to one linked account?
- Multi-currency: revisit if the family holds foreign-currency accounts/investments.
