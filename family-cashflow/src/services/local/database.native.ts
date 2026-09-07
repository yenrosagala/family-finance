import type { LocalDb } from './localDbTypes';

// On-device SQLite database (Android/iOS). Mirrors the core tables of
// schema.sql with TEXT primary keys (UUIDs) and REAL amounts. PostgreSQL
// numeric -> REAL keeps arithmetic simple for local balances.
//
// Balance integrity mirrors the server's balance-sync trigger: balances are
// only ever mutated by the repository's transaction apply/reverse functions,
// never written directly by callers.

const DB_NAME = 'famfin-local.db';
const SCHEMA_VERSION = 2;

const SCHEMA = `
  create table if not exists app_users (
    id text primary key,
    email text unique not null,
    password_hash text not null,
    display_name text not null,
    created_at text not null
  );

  create table if not exists households (
    id text primary key,
    name text not null,
    invite_code text unique not null,
    currency text not null default 'IDR',
    created_by text,
    created_at text not null
  );

  create table if not exists household_members (
    household_id text not null,
    user_id text not null,
    display_name text,
    photo_url text,
    role text not null default 'member',
    joined_at text not null,
    fcm_token text,
    primary key (household_id, user_id)
  );

  create table if not exists accounts (
    id text primary key,
    household_id text not null,
    name text not null,
    type text not null,
    balance real not null default 0,
    currency text not null default 'IDR',
    is_active integer not null default 1,
    created_at text not null
  );

  create table if not exists categories (
    id text primary key,
    household_id text not null,
    name text not null,
    icon text,
    color text,
    transaction_type text not null,
    is_default integer not null default 0,
    created_at text not null
  );

  create table if not exists transactions (
    id text primary key,
    household_id text not null,
    type text not null,
    amount real not null check (amount > 0),
    txn_date text not null,
    note text,
    added_by text,
    created_at text not null,
    category_id text,
    from_account_id text,
    to_account_id text,
    to_person text,
    investment_id text,
    saving_goal_id text,
    merchant_name text,
    receipt_image_url text,
    categorization_source text,
    receipt_fingerprint text
  );

  create index if not exists idx_local_txn_household_date on transactions(household_id, txn_date desc);

  create table if not exists budgets (
    id text primary key,
    household_id text not null,
    category_id text not null,
    monthly_limit real not null,
    month text,
    is_recurring integer not null default 1,
    rollover integer not null default 0,
    created_by text,
    created_at text not null
  );

  create table if not exists saving_goals (
    id text primary key,
    household_id text not null,
    name text not null,
    target_amount real not null,
    target_date text,
    linked_account_id text,
    created_at text not null
  );

  create table if not exists investments (
    id text primary key,
    household_id text not null,
    name text not null,
    type text not null,
    total_invested real not null default 0,
    current_value real not null default 0,
    last_updated text,
    created_at text not null
  );

  create table if not exists meta (
    key text primary key,
    value text
  );
`;

let dbPromise: Promise<LocalDb> | null = null;

function open(): Promise<LocalDb> {
  // This file only ever ships to Android/iOS bundles (Metro resolves
  // database.web.ts for web), so requiring expo-sqlite here is safe.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SQLite = require('expo-sqlite') as { openDatabaseAsync(name: string): Promise<unknown> };
  return Promise.resolve(SQLite.openDatabaseAsync(DB_NAME)).then(async (rawDb) => {
    const db = rawDb as LocalDb;
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(SCHEMA);
    await db.runAsync(
      `insert or ignore into meta(key, value) values ('schema_version', ?)`,
      [String(SCHEMA_VERSION)]
    );
    return db;
  });
}

export function getLocalDb(): Promise<LocalDb> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}