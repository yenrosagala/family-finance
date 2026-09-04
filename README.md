# FamFin — Family Finance Management

A cross-platform (Expo / React Native) family finance app: shared cash flow tracking, receipt scanning with OCR + auto-categorization, budgeting, savings goals, investments, and net worth tracking for a household.

## Stack

- **Client:** Expo SDK 57 (React Native 0.86 + TypeScript), Android first, iOS-compatible, runs in Expo Go
- **API bridge:** Node.js / Express (`api/`) — the client's single backend; scopes all queries by `household_id` in code
- **Database:** Hosted Supabase Postgres (free tier), connected by the API via the session-pooler (port 6543)
- **Auth:** Custom JWT issued by the API against a `public.app_users` table (bcrypt password hashing)
- **Receipt OCR:** Expo Camera capture + text recognition (adapter ready; on-device pass pending device testing)
- **Categorization:** Household-learned keyword/fuzzy dictionary (see `ARCHITECTURE.md`)

## Project Documents

| File | Purpose |
|---|---|
| `PRD.md` | What we're building and why — features, users, scope |
| `ARCHITECTURE.md` | Full technical design — data model, API, OCR pipeline, functions |
| `ARCHITECTURE-ESSENTIALS.md` | One-page cheat sheet of the architecture, for fast onboarding |
| `DEVELOPMENT.md` | Local setup, running the app, environment config |
| `FEATURE_CHECKLIST.md` | Feature list with build status, phased by MVP → v2 → v3 |
| `PRODUCTION_PLAN.md` | Rollout plan — phases, milestones, sequencing |
| `PRODUCTION_READY_CHECKLIST.md` | Gate checklist before shipping to real users |
| `AGENTS.md` | Instructions for AI coding agents (Claude Code etc.) working in this repo |
| `CLAUDE.md` | Claude-specific project context (mirrors AGENTS.md content) |

## Quick Start

See `DEVELOPMENT.md` for full setup. TL;DR:

```bash
# 1. Backend API (needs a hosted Supabase Postgres + api/.env)
cd api
npm install
cp .env.example .env   # fill in DATABASE_URL (session pooler), JWT_SECRET, PORT
npm start              # runs the Express API on :4000

# 2. Client (new terminal)
cd ../family-cashflow
npm install
npx expo start --host lan   # scan QR with Expo Go
```

## Repository Layout

- `api/` — Express backend: `src/routes/` (auth, household, accounts, categories, transactions, categorize, receipt, dictionary), `src/data/globalDictionary.js`
- `family-cashflow/` — Expo/React Native client: `src/` (`core`, `constants`, `models`, `services`, `screens`, `navigation`, `widgets`)
- `schema.sql` — authoritative Postgres data model
- `supabase/` — RLS policies, triggers, and Edge Functions (kept for production hardening)

## Status

**Stage 1 (Private Alpha): in progress.** Phase 1 (MVP) and most of Phase 2 (receipt scanning backend + client) are built and running against hosted Supabase Postgres. Account creation now supports an opening balance. Household invite-code join + member management UI added. Phases 3–6 (budgeting, transfers/investing, net worth/reports, polish) are not started.

See `FEATURE_CHECKLIST.md` for item-level status and `PRODUCTION_PLAN.md` for the rollout roadmap.
