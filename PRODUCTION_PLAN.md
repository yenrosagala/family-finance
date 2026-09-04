# Production Plan

## Philosophy

This is a family-scale app, not a commercial launch — "production" means "reliable enough for daily family use," not "scaled for thousands of tenants." The plan below sequences work so the app is genuinely useful as early as possible, rather than holding everything back for a single big release.

## Sequencing

### Stage 0 — Foundation (pre-code)
- ✅ Data model finalized (`schema.sql`)
- ✅ Architecture decisions locked (Flutter + Supabase, on-device OCR, dictionary-based categorization)
- ⬜ Supabase project provisioned, schema applied, RLS policies written
- ⬜ Flutter project scaffolded per `DEVELOPMENT.md` structure

### Stage 1 — Private Alpha (you + one other family member)
- Ship Phase 1 (MVP) + Phase 2 (receipt scanning) from `FEATURE_CHECKLIST.md`.
- Goal: replace whatever ad-hoc tracking (notes app, spreadsheet, memory) the family currently uses, for expense logging only.
- Success signal: both of you are logging real transactions daily without friction complaints.

### Stage 2 — Budgeting Rollout
- Ship Phase 3.
- Goal: budgets feel like a helpful nudge, not nagging — tune notification thresholds based on real reaction.

### Stage 3 — Full Financial Picture
- Ship Phase 4 (transfers/saving/investing) + Phase 5 (net worth/reports).
- Goal: the app becomes the single source of truth for "what's our financial state," replacing any separate net-worth spreadsheet.

### Stage 4 — Whole-Household Rollout
- Onboard remaining family members.
- Ship Phase 6 polish items based on friction observed in Stages 1–3.

## Milestones & Gates

| Milestone | Gate to proceed |
|---|---|
| Stage 0 → 1 | Schema applied, RLS tested (can't read other households' data), app builds and runs |
| Stage 1 → 2 | 2+ weeks of real daily use with no data-loss or double-counting incidents |
| Stage 2 → 3 | Budget notifications feel accurate (no false 100%-over alerts from bugs) |
| Stage 3 → 4 | Net worth number matches a manual sanity-check calculation |
| Ongoing | See `PRODUCTION_READY_CHECKLIST.md` before treating any stage as "done" |

## Risk Areas to Watch

- **OCR accuracy on real receipts** — test against actual family shopping receipts (minimarket, traditional market, online order printouts) early, not just clean samples.
- **Balance drift** — the sync trigger must be correct for all 7 transaction types; a bug here silently corrupts every account balance.
- **Adoption drop-off** — the classic budgeting-app failure mode. Watch for logging frequency dropping after the first few weeks and address friction immediately rather than adding more features.

## Rollback Plan

Since this runs on Supabase with standard Postgres, rollback is standard: point-in-time recovery (Supabase Pro tier) or manual backups (`pg_dump`) before any schema migration. Recommend taking a manual backup before every schema change while the app is actively used with real family data.
