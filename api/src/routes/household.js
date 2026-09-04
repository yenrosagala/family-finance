import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';
import { GLOBAL_DICTIONARY } from '../data/globalDictionary.js';

const router = Router();

// Default categories seeded for a new household
const DEFAULT_INCOME = [
  ['Salary', 'briefcase', '#10B981'],
  ['Freelance', 'laptop', '#34D399'],
  ['Investment Return', 'trending-up', '#6EE7B7'],
  ['Gift', 'gift', '#A7F3D0'],
  ['Other Income', 'plus-circle', '#D1FAE5'],
];
const DEFAULT_EXPENSE = [
  ['Food & Drinks', 'utensils', '#EF4444'],
  ['Transportation', 'car', '#F87171'],
  ['Shopping', 'shopping-bag', '#FCA5A5'],
  ['Bills & Utilities', 'zap', '#DC2626'],
  ['Entertainment', 'film', '#B91C1C'],
  ['Health', 'heart', '#991B1B'],
  ['Education', 'book-open', '#7F1D1D'],
  ['Groceries', 'shopping-cart', '#450A0A'],
  ['Rent', 'home', '#881337'],
  ['Other Expense', 'minus-circle', '#FECDD3'],
];

function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// GET /api/household — current user's household (or null)
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select h.* from households h
       join household_members m on m.household_id = h.id
       where m.user_id = $1
       limit 1`,
      [req.user.id]
    );
    return res.json({ household: rows[0] || null });
  } finally {
    client.release();
  }
});

// POST /api/household — create a household (user becomes admin)
router.post('/', authRequired, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'household name is required' });
  }
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query(
      `insert into households (name, invite_code, created_by)
       values ($1, $2, $3) returning *`,
      [String(name).trim(), inviteCode(), req.user.id]
    );
    const household = rows[0];

    await client.query(
      `insert into household_members (household_id, user_id, display_name, role)
       values ($1, $2, $3, 'admin')`,
      [household.id, req.user.id, req.body.displayName || 'Admin']
    );

    // Seed default categories
    for (const [cname, icon, color] of DEFAULT_INCOME) {
      await client.query(
        `insert into categories (household_id, name, icon, color, transaction_type, is_default)
         values ($1, $2, $3, $4, 'income', true)`,
        [household.id, cname, icon, color]
      );
    }
    for (const [cname, icon, color] of DEFAULT_EXPENSE) {
      await client.query(
        `insert into categories (household_id, name, icon, color, transaction_type, is_default)
         values ($1, $2, $3, $4, 'expense', true)`,
        [household.id, cname, icon, color]
      );
    }

    // Seed the global default item dictionary (mapped to expense categories by name)
    const { rows: categoryRows } = await client.query(
      `select id, name from categories where household_id = $1`,
      [household.id]
    );
    const categoryIdByName = {};
    for (const c of categoryRows) categoryIdByName[c.name] = c.id;
    for (const entry of GLOBAL_DICTIONARY) {
      const categoryId = categoryIdByName[entry.category];
      if (!categoryId) continue;
      await client.query(
        `insert into item_dictionary (household_id, keyword, normalized_keyword, category_id, source, confidence)
         values ($1, $2, $2, $3, 'default', 0.5)
         on conflict (household_id, keyword) do nothing`,
        [household.id, entry.keyword, categoryId]
      );
    }

    await client.query('commit');
    return res.status(201).json({ household });
  } catch (e) {
    await client.query('rollback');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/household/join — join via invite code
router.post('/join', authRequired, async (req, res) => {
  const { inviteCode } = req.body || {};
  if (!inviteCode) return res.status(400).json({ error: 'inviteCode is required' });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select * from households where invite_code = upper($1)`,
      [String(inviteCode).trim()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invalid invite code' });
    const household = rows[0];

    // Avoid duplicate membership
    await client.query(
      `insert into household_members (household_id, user_id, display_name, role)
       values ($1, $2, $3, 'member')
       on conflict (household_id, user_id) do nothing`,
      [household.id, req.user.id, req.body.displayName || 'Member']
    );

    return res.json({ household });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/household/members
router.get('/members', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select m.*, u.email from household_members m
       join households h on h.id = m.household_id
       join app_users u on u.id = m.user_id
       where h.id in (
         select household_id from household_members where user_id = $1
       )`,
      [req.user.id]
    );
    return res.json({ members: rows });
  } finally {
    client.release();
  }
});

// DELETE /api/household/members/:user_id — admin removes a member
router.delete('/members/:user_id', authRequired, async (req, res) => {
  const { user_id } = req.params;
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });
  // Admins can remove any member; non-admins cannot
  const { rows: member } = await pool.query(
    `select role from household_members where household_id = $1 and user_id = $2`,
    [householdId, user_id]
  );
  if (!member[0] || member[0].role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can remove members' });
  }
  await pool.query(
    `delete from household_members where household_id = $1 and user_id = $2`,
    [householdId, user_id]
  );
  return res.json({ deleted: true });
});

// GET /api/household/members/spending — spending per household member
router.get('/members/spending', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select u.email, u.display_name,
        count(*) as transaction_count,
        sum(case when t.type = 'income' then t.amount else 0 end) as income_total,
        sum(case when t.type = 'expense' then t.amount else 0 end) as expense_total,
        sum(t.amount) filter (where t.type = 'expense') as net_expense
       from household_members m
       join app_users u on u.id = m.user_id
       join transactions t on t.added_by = u.id
       join households h on h.id = m.household_id
      where h.id in (
        select household_id from household_members where user_id = $1
      )
      group by u.email, u.display_name
      order by net_expense desc`,
      [req.user.id]
    );
    return res.json({ spending: rows });
  } finally {
    client.release();
  }
});

export default router;
