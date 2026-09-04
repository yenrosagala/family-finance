# Architecture Essentials (1-page reference)

> Full detail in `ARCHITECTURE.md`. This is the fast-lookup version for active development.

## Stack
Flutter → Supabase (Postgres + Auth + Storage + Realtime + Edge Functions). OCR via ML Kit, on-device.

## Transaction types & balance effect

| Type | from_account_id | to_account_id | Effect |
|---|---|---|---|
| `income` | — | required | `+amount` to `to_account` |
| `expense` | required | — | `-amount` from `from_account` |
| `transfer` | required | required | `-amount` from source, `+amount` to dest (both internal) |
| `transfer_out` | required | — (`to_person` instead) | `-amount` from source (external recipient) |
| `transfer_in` | — (`to_person` instead) | required | `+amount` to dest (external sender) |
| `investment` | required | — | `-amount` from source; increments `investments.total_invested` |
| `saving` | required | required (linked goal's account) | `-amount`/`+amount`; increments `saving_goals.current_amount` |

**Only `income` and `expense` count toward net cashflow / P&L.** Everything else is money repositioning, not economic gain/loss.

## Categorization lookup order

1. `item_dictionary` exact match (household)
2. `item_dictionary` fuzzy match (household)
3. Global default dictionary (bundled asset)
4. Fallback → "Uncategorized", flagged in confirm screen

Confidence rises on user confirm, drops and re-learns on user correction.

## Net worth formula

```
total_assets = SUM(accounts.balance) + SUM(investments.current_value) + SUM(assets.current_value)
net_worth = total_assets - SUM(liabilities.current_balance)
```
Saving goals are NOT counted separately — they're a label on a linked account already included in `accounts.balance`.

## Duplicate-receipt guard

`receipt_fingerprint = hash(merchant_name + total + txn_date + item_count)` — checked against existing household transactions before save; user is warned, not blocked.

## Key tables (see `schema.sql` for full DDL)

`households` · `household_members` · `accounts` · `categories` · `transactions` · `transaction_line_items` · `item_dictionary` · `budgets` · `saving_goals` · `investments` · `assets` · `liabilities` · `net_worth_snapshots`

## Security model

Every table scoped by `household_id`; RLS checks requester is in `household_members` for that household. Admins can edit/delete anyone's transactions in the household; regular members can only edit/delete their own.
