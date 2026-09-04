# Production-Ready Checklist

Run through this before treating any release as safe for real family financial data.

## Data Integrity

- [ ] Balance-sync trigger tested for all 7 transaction types (income, expense, transfer, transfer_out, transfer_in, investment, saving)
- [ ] Editing a transaction correctly reverses the old balance effect before applying the new one
- [ ] Deleting a transaction correctly reverses its balance effect
- [ ] Net worth calculation manually cross-checked against a spreadsheet for at least one full month
- [ ] Saving goals confirmed NOT double-counted in net worth (label on account, not separate asset)
- [ ] Internal transfers confirmed excluded from income/expense P&L totals

## Receipt Scanning Safety

- [ ] Duplicate-receipt fingerprint check tested (scan same receipt twice → warning appears)
- [ ] Reconciliation check tested (line items sum mismatch vs total → warning appears)
- [ ] Nothing from OCR ever auto-saves without user confirmation
- [ ] Tested against real receipts: minimarket, traditional market/warung (handwritten or low-quality print), online order printout

## Security

- [ ] RLS policies applied to every table (no table left with default-open access)
- [ ] Verified: a user NOT in a household cannot read/write that household's data (test with two separate test accounts)
- [ ] Verified: a regular member cannot delete another member's transactions (admin-only rule enforced)
- [ ] Verified: `net_worth_snapshots` is read-only from the client (writes only via scheduled job)
- [ ] Supabase Storage bucket for receipts scoped by household (test cross-household access is denied)
- [ ] `.env` / API keys not committed to version control

## Reliability

- [ ] App functions with no network connection for manual entry + receipt scan (queues or clearly indicates pending sync)
- [ ] Realtime dashboard updates verified across two devices (one logs a transaction, other sees it live)
- [ ] Scheduled jobs (net worth snapshot, budget threshold check) verified to run on schedule, not just on-demand
- [ ] Budget notifications fire once per threshold crossing, not repeatedly per transaction

## Backup & Recovery

- [ ] Manual backup taken before any schema migration
- [ ] Confirmed restore process works (tested at least once, not just assumed)
- [ ] Point-in-time recovery available or backup cadence documented

## UX Sanity

- [ ] Amount-first entry confirmed on manual transaction form
- [ ] Confirm screen for receipt scans is fast to skim and correct (informal timing: under ~15 seconds for a typical receipt)
- [ ] Family members other than the builder have used the app and given feedback before calling any stage "done"

## Sign-off

This checklist is meant to be re-run before each stage transition in `PRODUCTION_PLAN.md`, not just once at the very end.
