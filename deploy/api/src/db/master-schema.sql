-- ============================================================
-- Master DB schema
-- Run this ONCE in your global Supabase project (the developer's project).
-- This project stores users and household registry only —
-- no financial data ever lives here.
-- ============================================================

-- Users table (replaces the per-household app_users)
-- Stores login credentials and which household each user belongs to.
CREATE TABLE IF NOT EXISTS app_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  display_name  TEXT,
  household_id  UUID,                        -- NULL until they create/join a household
  role          TEXT        NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Household registry
-- One row per household. Points to where that household's data lives.
-- db_url is the full Postgres connection string for their dedicated DB/schema.
-- schema_name is used when all households share one Supabase project
-- (schema-per-household approach — cheaper than project-per-household).
CREATE TABLE IF NOT EXISTS households_registry (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_name TEXT        NOT NULL,
  invite_code    TEXT        UNIQUE NOT NULL,
  db_url         TEXT        NOT NULL,         -- connection string to household DB
  schema_name    TEXT,                         -- set if using schema-per-household
  admin_email    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key: user → household
ALTER TABLE app_users
  ADD CONSTRAINT fk_user_household
  FOREIGN KEY (household_id)
  REFERENCES households_registry(id)
  ON DELETE SET NULL;

-- Index for fast lookup by invite code (used on every join request)
CREATE INDEX IF NOT EXISTS idx_households_invite_code
  ON households_registry(invite_code);

-- Index for fast lookup by user id (used on every authenticated request)
CREATE INDEX IF NOT EXISTS idx_app_users_id
  ON app_users(id);
