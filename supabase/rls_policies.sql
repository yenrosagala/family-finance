-- =========================================================
-- ROW LEVEL SECURITY POLICIES
-- Run after schema.sql. Every table is scoped to household
-- membership via household_members.
-- =========================================================

-- Helper function: is the current user a member of this household?
create or replace function is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Helper function: is the current user an admin of this household?
create or replace function is_household_admin(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- =========================================================
-- households
-- =========================================================
alter table households enable row level security;

create policy "members can read their household"
  on households for select
  using (is_household_member(id));

create policy "authenticated users can create a household"
  on households for insert
  with check (auth.uid() is not null and created_by = auth.uid());

create policy "admins can update their household"
  on households for update
  using (is_household_admin(id));

create policy "admins can delete their household"
  on households for delete
  using (is_household_admin(id));

-- =========================================================
-- household_members
-- =========================================================
alter table household_members enable row level security;

create policy "members can read household member list"
  on household_members for select
  using (is_household_member(household_id));

create policy "user can add self (join via invite) or admin adds others"
  on household_members for insert
  with check (user_id = auth.uid() or is_household_admin(household_id));

create policy "admin or self can update membership"
  on household_members for update
  using (is_household_admin(household_id) or user_id = auth.uid());

create policy "admin or self can remove membership"
  on household_members for delete
  using (is_household_admin(household_id) or user_id = auth.uid());

-- =========================================================
-- Generic shared-data tables: accounts, categories, budgets,
-- saving_goals, investments, assets, liabilities, item_dictionary
-- All follow the same pattern: any household member can read/write.
-- =========================================================

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

    execute format(
      'create policy "members can read %1$s" on %1$s for select using (is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "members can insert %1$s" on %1$s for insert with check (is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "members can update %1$s" on %1$s for update using (is_household_member(household_id));',
      t
    );
    execute format(
      'create policy "members can delete %1$s" on %1$s for delete using (is_household_member(household_id));',
      t
    );
  end loop;
end $$;

-- =========================================================
-- transactions
-- Read: any member. Insert: any member (must set addedBy = self).
-- Update/Delete: only the creator, or an admin.
-- =========================================================
alter table transactions enable row level security;

create policy "members can read transactions"
  on transactions for select
  using (is_household_member(household_id));

create policy "members can insert own transactions"
  on transactions for insert
  with check (is_household_member(household_id) and added_by = auth.uid());

create policy "owner or admin can update transactions"
  on transactions for update
  using (
    is_household_member(household_id)
    and (added_by = auth.uid() or is_household_admin(household_id))
  );

create policy "owner or admin can delete transactions"
  on transactions for delete
  using (
    is_household_member(household_id)
    and (added_by = auth.uid() or is_household_admin(household_id))
  );

-- =========================================================
-- transaction_line_items
-- Inherits access via parent transaction's household.
-- =========================================================
alter table transaction_line_items enable row level security;

create policy "members can read line items"
  on transaction_line_items for select
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_line_items.transaction_id
      and is_household_member(t.household_id)
    )
  );

create policy "members can insert line items"
  on transaction_line_items for insert
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_line_items.transaction_id
      and is_household_member(t.household_id)
    )
  );

create policy "owner or admin can update line items"
  on transaction_line_items for update
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_line_items.transaction_id
      and is_household_member(t.household_id)
      and (t.added_by = auth.uid() or is_household_admin(t.household_id))
    )
  );

create policy "owner or admin can delete line items"
  on transaction_line_items for delete
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_line_items.transaction_id
      and is_household_member(t.household_id)
      and (t.added_by = auth.uid() or is_household_admin(t.household_id))
    )
  );

-- =========================================================
-- net_worth_snapshots
-- Read-only for clients. Writes happen only via the scheduled
-- job, which runs with the service_role key (bypasses RLS).
-- =========================================================
alter table net_worth_snapshots enable row level security;

create policy "members can read net worth snapshots"
  on net_worth_snapshots for select
  using (is_household_member(household_id));

-- No insert/update/delete policy for authenticated/anon roles.
-- service_role bypasses RLS entirely, which is how the scheduled
-- job (running with the service key) writes these rows.

-- =========================================================
-- Storage: receipts bucket
-- Path convention: receipts/{household_id}/{transaction_id}/{filename}
-- =========================================================
-- Run in Supabase dashboard SQL editor after creating the 'receipts' bucket,
-- or via the Storage policies UI using this logic:

create policy "members can read household receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "members can upload household receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "members can delete household receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );
