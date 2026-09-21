# Production Plan

## Philosophy

This is a family-scale app, not a commercial launch — "production" means
"reliable enough for daily family use," not "scaled for thousands of tenants."
The plan below sequences work so the app is genuinely useful as early as
possible, rather than holding everything back for a single big release.

Deployment reality today: **the API and Postgres are runner-agnostic.** The
same codebase runs against a hosted Supabase Postgres (session pooler, port
5432) on a PC for development, and can be moved to a single VPS with the
`deploy/` package (systemd + optional Caddy HTTPS). The client also supports a
fully-offline local mode (on-device SQLite) chosen per device at sign-up.

## Sequencing

### Stage 0 — Foundation (pre-code)
- ✅ Data model finalized (`schema.sql`, `api/src/db/master-schema.sql` +
  per-household schema template)
- ✅ Architecture decisions locked (Expo/React Native + Express API → Postgres,
  on-device SQLite as offline fallback, OCR intent + dictionary-based
  categorization)
- ✅ Database provisioned two ways: hosted Supabase project and a local
  Docker Postgres (`docker compose up -d db`) — master schema applied to both
- ✅ Multi-household provisioning: register creates an `app_users` row +
  `households_registry` entry + provisions a `hh_<slug>_<suffix>` schema;
  tenant routing middleware scopes every query (`api/src/middleware/tenant.js`)
- ✅ Expo/React Native client scaffolded (`family-cashflow/`) + Express API
  (`api/`); app builds and runs

### Stage 1 — Private Alpha (you + one other family member) — CURRENT
- ✅ Phase 1 (MVP): auth (custom JWT + `app_users`), household create/join,
  accounts (with opening balance), categories, manual transaction entry,
  dashboard (net cashflow + income-vs-expense charts + Sankey), balance-sync
  trigger, RLS written.
- ✅ **Cloud signup verified against real Supabase** over the session pooler
  (port 5432): register returns 201 twice, two `hh_*` schemas created, login
  and join tested. The Supabase project is the live master DB for development.
- ✅ **Local (offline) mode verified:** the whole core loop (auth, household,
  accounts, categories, transactions, summaries, net worth) runs on on-device
  SQLite via web/native DB adapters, plus budgets/saving-goals/investments.
  Reports/export are available in local mode; assets/liabilities and the
  multi-device household features are cloud-only and surface a clear
  "not available in Local mode" message.
- 🟨 Phase 2 (receipt scanning): parsing, dictionary + fuzzy categorization
  (`api/src/services/categorizeText.js`, exact → fuzzy → fallback), confirm
  step, dedupe/reconciliation/fingerprint, correction loop — built and
  verified server-side. **No in-app scan UI exists** — the client camera/scan
  screens were removed; the API endpoints are ready for a UI to call.
- 🟨 **Server-side OCR (PaddleOCR-VL)** (`ocr_service/`): loads under
  transformers 5.x with rope/`cache_position` compat; `/ocr` endpoint and an
  unauthenticated app→API proxy (`POST /api/receipt/ocr`) are live; text-only
  generation verified. **Image-conditioned OCR output is currently garbage
  (model returns ~1 spurious token per image)** — the weights/rope/position
  compat are proven good, so the gap is the vision-feature merge path under
  transformers 5.x. OCR is NOT wired in as the scan default.
- Goal: replace whatever ad-hoc tracking (notes app, spreadsheet, memory) the
  family currently uses, for expense logging only.
- Success signal: both of you are logging real transactions daily without
  friction complaints.
- **Not yet met:** this stage needs 2+ weeks of real daily use and the
  cross-account/real-receipt verification items in
  `PRODUCTION_READY_CHECKLIST.md` before being called done.

### Stage 2 — Budgeting Rollout (core started)
- 🟨 Phase 3 is largely built: budget CRUD + progress bars + dashboard health
  strip + inline budget hint — backend `/api/budgets` + `BudgetsScreen`.
  **Remaining:** budget threshold notifications (80%/100% job) and suggested
  budgets.
- Goal: budgets feel like a helpful nudge, not nagging — tune thresholds on
  real reaction.

### Stage 3 — Full Financial Picture (Phase 4 done, Phase 5 started)
- ✅ Phase 4: transaction type picker, internal/external transfers (to_person),
  saving goals + investments CRUD/contribution/mark-to-market, dashboard
  saved-&-invested section — backend `/api/saving-goals`, `/api/investments`;
  `SavingGoalsScreen`, `InvestmentsScreen`.
- ✅ Phase 5 partial: assets/liabilities CRUD (`/api/assets`, `/api/liabilities`,
  `AssetsScreen`/`LiabilitiesScreen`), net worth screen with snapshot history
  (`/api/net-worth`, `NetWorthScreen`).
- ⬜ Phase 5 remaining: monthly net-worth snapshot scheduled job, reports
  screen (income statement / balance sheet, date-range picker, period
  comparison, PDF export).
- Goal: the app becomes the single source of truth for "what's our financial
  state," replacing any separate net-worth spreadsheet.

### Stage 4 — Whole-Household Rollout
- Onboard remaining family members.
- Ship Phase 6 polish items based on friction observed in Stages 1–3:
  - ✅ Indonesian-style number formatting (`1.500.000`)
  - ✅ Server-side receipt pipeline (OCR proxy + parse + categorize)
  - ✅ Household member remove endpoint + per-member spending breakdown
  - ✅ Search across transactions
  - ⬜ CSV export
  - ⬜ Push notifications (FCM) + monthly asset-update reminder
  - ⬜ Offline write queue (if gaps prove painful in real use)

## Milestones & Gates

| Milestone | Gate to proceed |
|---|---|
| Stage 0 → 1 | Master schema applied, tenant provisioning creates isolated `hh_*` schemas, app builds and runs |
| Stage 1 → 2 | 2+ weeks of real daily use with no data-loss or double-counting incidents |
| Stage 2 → 3 | Budget notifications feel accurate (no false 100%-over alerts from bugs) |
| Stage 3 → 4 | Net worth number matches a manual sanity-check calculation |
| Ongoing | See `PRODUCTION_READY_CHECKLIST.md` before treating any stage as "done" |

## Deployment Path

The `deploy/` folder is the one-server package: `deploy.sh` installs Postgres
+ Node 20, loads the master schema, runs the API as a systemd service, and
optionally fronts it with Caddy for HTTPS (`FAMFIN_DOMAIN`). A container/PaaS
route (Dockerfile, `render.yaml`, `compose.yaml`) is also included. Both are
described in `deploy/README.md`.

Until then, development runs against hosted Supabase **via the session pooler
(port 5432)**. Transaction-pooler URLs (`:6543`) are rejected at startup
because the account-balance sync trigger depends on `BEGIN/COMMIT`.

## Risk Areas to Watch

- **OCR accuracy on real receipts** — test against actual family shopping
  receipts (minimarket, traditional market, online order printouts) early,
  not just clean samples. **Current blocker:** server OCR loads and generates
  but vision conditioning returns garbage under transformers 5.x — untested
  against any real receipt until resolved.
- **Balance drift** — the sync trigger must be correct for all 7 transaction
  types and for edit/delete, not just insert; a bug here silently corrupts
  every account balance. Test before every release.
- **P&L contamination** — transfers/saving/investment transactions must never
  leak into income/expense totals or reports; this is a standing non-negotiable
  rule (see `AGENTS.md`).
- **Adoption drop-off** — the classic budgeting-app failure mode. Watch for
  logging frequency dropping after the first few weeks and address friction
  immediately rather than adding more features.

## Rollback Plan

- **Hosted Postgres (Supabase):** point-in-time recovery (Pro) or manual
  backups (`pg_dump`) before any schema migration. The client is stateless
  (auth via JWT), so the API is the only service to roll — rollback = deploy
  `git revert` of the API and restore the DB.
- **Local mode:** on-device SQLite; changing any schema version in
  `src/services/local/` must ship with a migration path for installed
  households.
- **Budget/OCR jobs:** both are separate services with no coupling to the
  write path — disable them independently if they misbehave.
- Recommend a manual backup before every schema change while the app is
  actively used with real family data.