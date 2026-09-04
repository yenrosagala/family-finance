-- =========================================================
-- FAMILY CASH FLOW APP — SUPABASE / POSTGRES SCHEMA
-- =========================================================

-- Households (the shared family unit)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  currency text not null default 'IDR',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Members (join table between auth.users and households)
create table household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  photo_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  fcm_token text,                      -- for push notifications
  primary key (household_id, user_id)
);

-- Accounts (cash, bank, e-wallet, credit card)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'ewallet', 'credit_card')),
  balance numeric(14,2) not null default 0,
  currency text not null default 'IDR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Categories (income/expense only)
create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Transactions (the core table — every money movement)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  type text not null check (type in
    ('income', 'expense', 'transfer', 'transfer_out', 'transfer_in', 'investment', 'saving')),
  amount numeric(14,2) not null check (amount > 0),
  txn_date date not null,
  note text,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  -- type-specific fields (nullable, only relevant ones populated per type)
  category_id uuid references categories(id),
  from_account_id uuid references accounts(id),
  to_account_id uuid references accounts(id),
  to_person text,                      -- external transfer_out/transfer_in
  investment_id uuid references investments(id),
  saving_goal_id uuid references saving_goals(id),

  -- receipt scan metadata
  merchant_name text,
  receipt_image_url text,
  categorization_source text check (categorization_source in ('exact', 'fuzzy', 'fallback', 'manual')),
  receipt_fingerprint text             -- for duplicate-scan detection
);

create index idx_transactions_household_date on transactions(household_id, txn_date desc);
create index idx_transactions_category on transactions(household_id, category_id);
create index idx_transactions_fingerprint on transactions(household_id, receipt_fingerprint);

-- Line items (subtable, since we may want to query items across receipts later —
-- easy in SQL via a JOIN, unlike the Firestore version where it was a tradeoff)
create table transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  raw_text text not null,              -- original OCR text
  normalized_text text,                -- cleaned/matched form
  amount numeric(14,2) not null,
  category_id uuid references categories(id),
  categorization_source text check (categorization_source in ('exact', 'fuzzy', 'fallback', 'manual'))
);

-- Item dictionary (learned categorization rules per household)
create table item_dictionary (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  keyword text not null,               -- normalized OCR text
  normalized_keyword text,             -- canonical matched form
  category_id uuid references categories(id),
  source text not null check (source in ('default', 'learned', 'manual')),
  confidence numeric(3,2) default 0.5,
  times_confirmed int not null default 0,
  times_corrected int not null default 0,
  last_used timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, keyword)
);

-- Budgets
create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  monthly_limit numeric(14,2) not null,
  month char(7),                       -- 'YYYY-MM', null if recurring
  is_recurring boolean not null default true,
  rollover boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Saving goals
create table saving_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  target_date date,
  linked_account_id uuid references accounts(id),
  created_at timestamptz not null default now()
);

-- Investments
create table investments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('stocks', 'mutual_fund', 'gold', 'crypto', 'property', 'other')),
  total_invested numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  last_updated timestamptz,
  created_at timestamptz not null default now()
);

-- Non-account, non-investment assets (property, vehicles, etc.)
create table assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('property', 'vehicle', 'other')),
  current_value numeric(14,2) not null default 0,
  last_updated timestamptz
);

-- Liabilities
create table liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('mortgage', 'loan', 'credit_card', 'other')),
  current_balance numeric(14,2) not null default 0,
  original_amount numeric(14,2),
  interest_rate numeric(5,2),
  last_updated timestamptz
);

-- Net worth snapshots (populated by a scheduled job, not written by clients)
create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  month char(7) not null,              -- 'YYYY-MM'
  total_assets numeric(14,2) not null,
  total_liabilities numeric(14,2) not null,
  net_worth numeric(14,2) not null,
  breakdown jsonb,                     -- { accounts, investments, assets, liabilities }
  created_at timestamptz not null default now(),
  unique (household_id, month)
);
