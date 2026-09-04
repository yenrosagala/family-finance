# Family Cash Flow

A cross-platform (Expo / React Native) family finance app: shared cash flow tracking, receipt scanning with on-device OCR + auto-categorization, budgeting, savings goals, investments, and net worth tracking for a household.

## Stack

- **Client:** Expo (React Native + TypeScript), Android first, iOS-compatible by default, runs in Expo Go
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
- **Receipt OCR:** Expo Camera capture + text recognition (on-device, offline)
- **Categorization:** Household-learned keyword/fuzzy dictionary (see `ARCHITECTURE.md`)

## Project Documents

| File | Purpose |
|---|---|
| `PRD.md` | What we're building and why — features, users, scope |
| `ARCHITECTURE.md` | Full technical design — data model, sync, OCR pipeline, functions |
| `ARCHITECTURE-ESSENTIALS.md` | One-page cheat sheet of the architecture, for fast onboarding |
| `DEVELOPMENT.md` | Local setup, running the app, environment config |
| `FEATURE_CHECKLIST.md` | Feature list with build status, phased by MVP → v2 → v3 |
| `PRODUCTION_PLAN.md` | Rollout plan — phases, milestones, sequencing |
| `PRODUCTION_READY_CHECKLIST.md` | Gate checklist before shipping to real users |
| `AGENTS.md` | Instructions for AI coding agents (Claude Code etc.) working in this repo |
| `CLAUDE.md` | Claude-specific project context (symlink/alias of AGENTS.md content) |

## Quick Start

See `DEVELOPMENT.md` for full setup. TL;DR:

```bash
cd family-cashflow
npm install
cp .env.example .env   # fill in SUPABASE URL + anon key
npm start              # scan QR with Expo Go
```

## Backend (ready to apply)

- `schema.sql` — full Postgres schema
- `supabase/rls_policies.sql` — Row Level Security for every table + storage bucket
- `supabase/triggers.sql` — account balance sync + saving/investment rollup triggers
- `supabase/functions/monthly-net-worth-snapshot/` — Edge Function, scheduled monthly
- `supabase/functions/budget-threshold-check/` — Edge Function, fired by a DB webhook on new expenses

Apply order and deployment steps are in `DEVELOPMENT.md`.

## Status

Backend fully specified and ready to apply to a Supabase project. Expo/React Native client scaffolded — auth, household onboarding, dashboard, and transaction entry screens are in progress (Phase 1 MVP). See `FEATURE_CHECKLIST.md` for what's next.
