# Production Plan

## Philosophy

This is a family-scale app, not a commercial launch — "production" means "reliable enough for daily family use," not "scaled for thousands of tenants." The plan below sequences work so the app is genuinely useful as early as possible, rather than holding everything back for a single big release.

## Sequencing

### Stage 0 — Foundation (pre-code)
- ✅ Data model finalized (`schema.sql`)
- ✅ Architecture decisions locked (Expo/React Native + Express API → hosted Supabase Postgres, on-device OCR intent, dictionary-based categorization)
- ✅ Supabase project provisioned, schema applied, RLS + triggers written (`supabase/`)
- ✅ Expo/React Native client scaffolded (`family-cashflow/`) + Express API (`api/`); app builds and runs

### Stage 1 — Private Alpha (you + one other family member) — CURRENT
- ✅ Phase 1 (MVP): auth (custom JWT + `app_users`), household create/join, accounts (with opening balance), categories, manual transaction entry, dashboard (net cashflow + donut), balance-sync trigger, RLS written.
- 🟨 Phase 2 (receipt scanning): parsing, dictionary + fuzzy categorization + **Naive Bayes ML classifier** (`api/src/ml/classifier.js`), confirm screen, dedupe/reconciliation/fingerprint, correction loop — all built and verified server-side. **Camera capture from a real device is the remaining piece** (sandbox can't test it).
- 🟨 **Server-side OCR (PaddleOCR-VL)**: `ocr_service/` now loads the PaddleOCR-VL model on this machine under transformers 5.x (rope + `cache_position` compat patches), with an end-to-end `/ocr` endpoint and an unauthenticated app→API proxy (`POST /api/receipt/ocr`). Text-only generation is verified correct; **image-conditioned OCR output is currently garbage (model returns ~1 spurious token on any image)** — weights/rope/position-compat are proven good, so the gap is the vision-feature merge path under transformers 5.x remote code. Two directions: (a) serve OCR via Paddle's native engine (PaddleX/PaddleOCR python) which the upstream demo actually uses, or (b) keep debugging the HF transformers path. Not wired into the scan flow as primary until output quality is usable.
- Goal: replace whatever ad-hoc tracking (notes app, spreadsheet, memory) the family currently uses, for expense logging only.
- Success signal: both of you are logging real transactions daily without friction complaints.
- **Not yet met:** this stage needs 2+ weeks of real daily use and the cross-account/real-receipt verification items in `PRODUCTION_READY_CHECKLIST.md` before being called done.

### Stage 2 — Budgeting Rollout (core started)
- 🟨 Phase 3: budget CRUD + progress bars + dashboard health strip built (backend `/api/budgets` + `BudgetsScreen`). **Remaining in Phase 3:** inline budget hint on transaction entry, threshold notifications (80%/100% job), suggested budgets.
- Goal: budgets feel like a helpful nudge, not nagging — tune notification thresholds based on real reaction.

### Stage 3 — Full Financial Picture (Phase 4 started)
- 🟨 Phase 4: transaction type picker, internal/external transfers (to_person), saving goals + investments CRUD/contribution/mark-to-market, dashboard saved-&-invested section — built and verified (backend `/api/saving-goals`, `/api/investments`; `SavingGoalsScreen`, `InvestmentsScreen`).
- ✅ Phase 3 budgeting done except threshold notifications (needs deploy + device push).
- ⬜ Phase 5 (net worth/reports) remains.
- Goal: the app becomes the single source of truth for "what's our financial state," replacing any separate net-worth spreadsheet.

### Stage 4 — Whole-Household Rollout
- Onboard remaining family members.
- Ship Phase 6 polish items based on friction observed in Stages 1–3:
  - ✅ Number formatting (dot thousands separator)
  - ✅ ML category classifier
  - ✅ Household member remove endpoint
  - ✅ Per-member spending breakdown
  - ✅ Search across transactions
  - ⬜ CSV export
  - ⬜ Push notifications
  - ⬜ Monthly asset-update reminder

## Milestones & Gates

| Milestone | Gate to proceed |
|---|---|
| Stage 0 → 1 | Schema applied, RLS tested (can't read other households' data), app builds and runs |
| Stage 1 → 2 | 2+ weeks of real daily use with no data-loss or double-counting incidents |
| Stage 2 → 3 | Budget notifications feel accurate (no false 100%-over alerts from bugs) |
| Stage 3 → 4 | Net worth number matches a manual sanity-check calculation |
| Ongoing | See `PRODUCTION_READY_CHECKLIST.md` before treating any stage as "done" |

## Risk Areas to Watch

- **OCR accuracy on real receipts** — test against actual family shopping receipts (minimarket, traditional market, online order printouts) early, not just clean samples. **Current blocker:** server OCR loads and generates but vision conditioning returns garbage under transformers 5.x — untested against any real receipt until resolved.
- **Balance drift** — the sync trigger must be correct for all 7 transaction types; a bug here silently corrupts every account balance.
- **Adoption drop-off** — the classic budgeting-app failure mode. Watch for logging frequency dropping after the first few weeks and address friction immediately rather than adding more features.

## Rollback Plan

Since this runs on Supabase with standard Postgres, rollback is standard: point-in-time recovery (Supabase Pro tier) or manual backups (`pg_dump`) before any schema migration. Recommend taking a manual backup before every schema change while the app is actively used with real family data.
