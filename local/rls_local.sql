-- =========================================================
-- LOCAL ROW LEVEL SECURITY (Postgres-only stand-in for Supabase)
-- Mirrors supabase/rls_policies.sql. auth.uid() reads the
-- GUC app.current_user_id that the client sets per request.
-- =========================================================

-- Helper: is the current user a member of this household?
create or replace function is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$ language sql stable;

-- Helper: is the current user an admin of this household?
create or replace function is_household_admin(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'admin'
  );
$$ language sql stable;

-- households
alter table households enable row level security;
drop policy if exists "members can read their household" on households;
create policy "members can read their household"
  on households for select using (is_household_member(id));
drop policy if exists "authenticated users can create a household" on households;
create policy "authenticated users can create a household"
  on households for insert with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists "admins can update their household" on households;
create policy "admins can update their household"
  on households for update using (is_household_admin(id));
drop policy if exists "admins can delete their household" on households;
create policy "admins can delete their household"
  on households for delete using (is_household_admin(id));

-- household_members
alter table household_members enable row level security;
drop policy if exists "members can read household member list" on household_members;
create policy "members can read household member list"
  on household_members for select using (is_household_member(household_id));
drop policy if exists "user can add self" on household_members;
create policy "user can add self"
  on household_members for insert with check (user_id = auth.uid() or is_household_admin(household_id));
drop policy if exists "admin or self can update membership" on household_members;
create policy "admin or self can update membership"
  on household_members for update using (is_household_admin(household_id) or user_id = auth.uid());
drop policy if exists "admin or self can remove membership" on household_members;
create policy "admin or self can remove membership"
  on household_members for delete using (is_household_admin(household_id) or user_id = auth.uid());

-- Shared-data tables: any household member can read/write.
do $$
declare
  t text;
  tables text[] := array[
    'accounts', 'categories', 'budgets', 'saving_goals',
    'investments', 'assets', 'liabilities', 'item_dictionary'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "members can read %1$s" on %1$s;', t);
    execute format('create policy "members can read %1$s" on %1$s for select using (is_household_member(household_id));', t);
    execute format('drop policy if exists "members can insert %1$s" on %1$s;', t);
    execute format('create policy "members can insert %1$s" on %1$s for insert with check (is_household_member(household_id));', t);
    execute format('drop policy if exists "members can update %1$s" on %1$s;', t);
    execute format('create policy "members can update %1$s" on %1$s for update using (is_household_member(household_id));', t);
    execute format('drop policy if exists "members can delete %1$s" on %1$s;', t);
    execute format('create policy "members can delete %1$s" on %1$s for delete using (is_household_member(household_id));', t);
  end loop;
end $$;

-- transactions
alter table transactions enable row level security;
drop policy if exists "members can read transactions" on transactions;
create policy "members can read transactions"
  on transactions for select using (is_household_member(household_id));
drop policy if exists "members can insert own transactions" on transactions;
create policy "members can insert own transactions"
  on transactions for insert with check (is_household_member(household_id) and added_by = auth.uid());
drop policy if exists "owner or admin can update transactions" on transactions;
create policy "owner or admin can update transactions"
  on transactions for update using (
    is_household_member(household_id) and (added_by = auth.uid() or is_household_admin(household_id))
  );
drop policy if exists "owner or admin can delete transactions" on transactions;
create policy "owner or admin can delete transactions"
  on transactions for delete using (
    is_household_member(household_id) and (added_by = auth.uid() or is_household_admin(household_id))
  );

-- transaction_line_items
alter table transaction_line_items enable row level security;
drop policy if exists "members can read line items" on transaction_line_items;
create policy "members can read line items"
  on transaction_line_items for select using (
    exists (select 1 from transactions t where t.id = transaction_line_items.transaction_id and is_household_member(t.household_id))
  );
drop policy if exists "members can insert line items" on transaction_line_items;
create policy "members can insert line items"
  on transaction_line_items for insert with check (
    exists (select 1 from transactions t where t.id = transaction_line_items.transaction_id and is_household_member(t.household_id))
  );
drop policy if exists "owner or admin can update line items" on transaction_line_items;
create policy "owner or admin can update line items"
  on transaction_line_items for update using (
    exists (select 1 from transactions t where t.id = transaction_line_items.transaction_id and is_household_member(t.household_id))
  );
drop policy if exists "owner or admin can delete line items" on transaction_line_items;
create policy "owner or admin can delete line items"
  on transaction_line_items for delete using (
    exists (select 1 from transactions t where t.id = transaction_line_items.transaction_id and is_household_member(t.household_id))
  );

-- net_worth_snapshots (client read-only)
alter table net_worth_snapshots enable row level security;
drop policy if exists "members can read net worth snapshots" on net_worth_snapshots;
create policy "members can read net worth snapshots"
  on net_worth_snapshots for select using (is_household_member(household_id));
