# Architecture Essentials (1-page reference)

> Full detail in `ARCHITECTURE.md`. This is the fast-lookup version for active development.

## Stack
Expo SDK 57 (React Native 0.86 + TypeScript) → Express API (`api/`) → Hosted Supabase Postgres (session pooler, port 6543). Auth = custom JWT vs `app_users` (bcrypt). OCR via Expo Camera (on-device intent, adapter swappable).

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

**Account opening balance** = an `income` transaction (category "Opening Balance") created with the account, so the trigger sets `accounts.balance`. Never a direct balance write.

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

Every table is scoped by `household_id`. `supabase/rls_policies.sql` defines RLS that checks the requester is in `household_members` for that household. Today the API connects as the DB superuser and re-enforces scoping in code; switch to least-privilege DB roles and verify cross-household tests before production. Admins can edit/delete anyone's transactions in the household; regular members can only edit/delete their own.
