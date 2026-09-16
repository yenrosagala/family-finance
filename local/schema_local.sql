-- =========================================================
-- FAMILY CASH FLOW — LOCAL POSTGRES SETUP (no Supabase)
-- Runs against a plain PostgreSQL instance.
-- =========================================================

-- ---------------------------------------------------------
-- 1) AUTH EMULATION
-- Minimal stand-in for Supabase Auth so the existing app code
-- (auth.uid(), users table) keeps working locally.
-- ---------------------------------------------------------

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- Returns the id of the "current" user.
-- In a real multi-device setup this would read a session. For the
-- local app we expose the id of the most recently created user by
-- default. The client service sets THE_CURRENT_AUTH_USER before
-- authenticated calls (see authService local implementation).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------
-- 2) BASE SCHEMA (mirrors schema.sql, minus Supabase crates)
-- ---------------------------------------------------------

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  currency text not null default 'IDR',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  photo_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  fcm_token text,
  primary key (household_id, user_id)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'ewallet', 'credit_card')),
  balance numeric(14,2) not null default 0,
  currency text not null default 'IDR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- saving_goals, investments, assets, liabilities must exist before
-- transactions (FK references). NOTE: the original schema.sql has these
-- after transactions, which would fail on a clean apply; reordered here.

create table if not exists saving_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  target_date date,
  linked_account_id uuid references accounts(id),
  created_at timestamptz not null default now()
);

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('stocks', 'mutual_fund', 'gold', 'crypto', 'property', 'other')),
  total_invested numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  last_updated timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('property', 'vehicle', 'other')),
  current_value numeric(14,2) not null default 0,
  last_updated timestamptz
);

create table if not exists liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('mortgage', 'loan', 'credit_card', 'other')),
  current_balance numeric(14,2) not null default 0,
  original_amount numeric(14,2),
  interest_rate numeric(5,2),
  last_updated timestamptz
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  type text not null check (type in
    ('income', 'expense', 'transfer', 'transfer_out', 'transfer_in', 'investment', 'saving')),
  amount numeric(14,2) not null check (amount > 0),
  txn_date date not null,
  note text,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  category_id uuid references categories(id),
  from_account_id uuid references accounts(id),
  to_account_id uuid references accounts(id),
  to_person text,
  investment_id uuid references investments(id),
  saving_goal_id uuid references saving_goals(id),
  merchant_name text,
  receipt_image_url text,
  categorization_source text check (categorization_source in ('exact', 'fuzzy', 'fallback', 'manual')),
  receipt_fingerprint text
);

create index if not exists idx_transactions_household_date on transactions(household_id, txn_date desc);
create index if not exists idx_transactions_category on transactions(household_id, category_id);
create index if not exists idx_transactions_fingerprint on transactions(household_id, receipt_fingerprint);

create table if not exists transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  raw_text text not null,
  normalized_text text,
  amount numeric(14,2) not null,
  category_id uuid references categories(id),
  categorization_source text check (categorization_source in ('exact', 'fuzzy', 'fallback', 'manual'))
);

create table if not exists item_dictionary (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  keyword text not null,
  normalized_keyword text,
  category_id uuid references categories(id),
  source text not null check (source in ('default', 'learned', 'manual')),
  confidence numeric(3,2) default 0.5,
  times_confirmed int not null default 0,
  times_corrected int not null default 0,
  last_used timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, keyword)
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  monthly_limit numeric(14,2) not null,
  month char(7),
  is_recurring boolean not null default true,
  rollover boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  month char(7) not null,
  total_assets numeric(14,2) not null,
  total_liabilities numeric(14,2) not null,
  net_worth numeric(14,2) not null,
  breakdown jsonb,
  created_at timestamptz not null default now(),
  unique (household_id, month)
);

-- ---------------------------------------------------------
-- 3) TRIGGERS — balance sync + saving/investment rollup
-- (same logic as supabase/triggers.sql, unmodified semantics)
-- ---------------------------------------------------------

create or replace function apply_balance_delta(
  p_type text,
  p_amount numeric,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_sign int
) returns void as $$
declare
  delta numeric := p_amount * p_sign;
begin
  case p_type
    when 'income' then
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;
    when 'expense' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
    when 'transfer' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;
    when 'transfer_out' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
    when 'transfer_in' then
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;
    when 'investment' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
    when 'saving' then
      if p_from_account_id is not null then
        update accounts set balance = balance - delta where id = p_from_account_id;
      end if;
      if p_to_account_id is not null then
        update accounts set balance = balance + delta where id = p_to_account_id;
      end if;
    else
      raise exception 'Unknown transaction type: %', p_type;
  end case;
end;
$$ language plpgsql;

create or replace function sync_account_balance()
returns trigger as $$
begin
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    perform apply_balance_delta(old.type, old.amount, old.from_account_id, old.to_account_id, -1);
  end if;
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    perform apply_balance_delta(new.type, new.amount, new.from_account_id, new.to_account_id, 1);
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_sync_account_balance on transactions;
create trigger trg_sync_account_balance
  after insert or update or delete on transactions
  for each row execute function sync_account_balance();

create or replace function sync_goal_and_investment_totals()
returns trigger as $$
begin
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    if old.type = 'saving' and old.saving_goal_id is not null then
      update saving_goals set current_amount = current_amount - old.amount
        where id = old.saving_goal_id;
    end if;
    if old.type = 'investment' and old.investment_id is not null then
      update investments set total_invested = total_invested - old.amount
        where id = old.investment_id;
    end if;
  end if;
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    if new.type = 'saving' and new.saving_goal_id is not null then
      update saving_goals set current_amount = current_amount + new.amount
        where id = new.saving_goal_id;
    end if;
    if new.type = 'investment' and new.investment_id is not null then
      update investments set total_invested = total_invested + new.amount
        where id = new.investment_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_sync_goal_and_investment_totals on transactions;
create trigger trg_sync_goal_and_investment_totals
  after insert or update or delete on transactions
  for each row execute function sync_goal_and_investment_totals();
