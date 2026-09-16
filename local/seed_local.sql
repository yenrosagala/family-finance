-- =========================================================
-- LOCAL SEED: demo user + household + default categories
-- =========================================================

-- Demo user (password: demo1234, hashed with pgcrypto crypt if available,
-- otherwise plain for dev)
insert into auth.users (email, password_hash, display_name)
values ('demo@family.local', 'demo1234', 'Demo Admin')
on conflict (email) do nothing;

-- The demo household
insert into households (id, name, invite_code, currency, created_by)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Demo Family',
  'DEMO001',
  'IDR',
  id
from auth.users where email = 'demo@family.local'
on conflict (invite_code) do nothing;

-- Membership
insert into household_members (household_id, user_id, display_name, role)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  id,
  'Demo Admin',
  'admin'
from auth.users where email = 'demo@family.local'
on conflict (household_id, user_id) do nothing;

-- Default accounts
insert into accounts (household_id, name, type, balance, currency)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Cash', 'cash', 500000, 'IDR'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Bank Account', 'bank', 5000000, 'IDR'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'E-Wallet', 'ewallet', 250000, 'IDR')
on conflict do nothing;

-- Default income categories
insert into categories (household_id, name, icon, color, transaction_type, is_default)
select '11111111-1111-1111-1111-111111111111'::uuid, c.name, c.icon, c.color, 'income', true
from (values
  ('Salary', 'briefcase', '#10B981'),
  ('Freelance', 'laptop', '#34D399'),
  ('Investment Return', 'trending-up', '#6EE7B7'),
  ('Gift', 'gift', '#A7F3D0'),
  ('Other Income', 'plus-circle', '#D1FAE5')
) as c(name, icon, color)
on conflict do nothing;

-- Default expense categories
insert into categories (household_id, name, icon, color, transaction_type, is_default)
select '11111111-1111-1111-1111-111111111111'::uuid, c.name, c.icon, c.color, 'expense', true
from (values
  ('Food & Drinks', 'utensils', '#EF4444'),
  ('Transportation', 'car', '#F87171'),
  ('Shopping', 'shopping-bag', '#FCA5A5'),
  ('Bills & Utilities', 'zap', '#DC2626'),
  ('Entertainment', 'film', '#B91C1C'),
  ('Health', 'heart', '#991B1B'),
  ('Education', 'book-open', '#7F1D1D'),
  ('Groceries', 'shopping-cart', '#450A0A'),
  ('Rent', 'home', '#881337'),
  ('Other Expense', 'minus-circle', '#FECDD3')
) as c(name, icon, color)
on conflict do nothing;
