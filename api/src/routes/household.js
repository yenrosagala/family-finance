import { Router } from 'express';
import { GLOBAL_DICTIONARY } from '../data/globalDictionary.js';
import { masterDb } from '../db.js';
import { generateInviteCode } from '../services/provision.js';

const router = Router();
// All routes here use req.householdDb (household schema) + req.householdId + req.user
// set by tenantMiddleware in server.js.

// GET /api/household — current user's household info
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select * from households where id = $1 limit 1`,
      [req.householdId]
    );
    return res.json({ household: rows[0] || null });
  } finally {
    client.release();
  }
});

// GET /api/household/members
router.get('/members', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select m.*, u.email
       from household_members m
       join app_users u on u.id = m.user_id
       where m.household_id = $1`,
      [req.householdId]
    );
    return res.json({ members: rows });
  } finally {
    client.release();
  }
});

// DELETE /api/household/members/:user_id — admin removes a member
router.delete('/members/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const client = await req.householdDb.connect();
  try {
    // Fix: check the CALLER's role, not the target member's role
    const { rows: callerRows } = await client.query(
      `select role from household_members where household_id = $1 and user_id = $2`,
      [req.householdId, req.user.id]
    );
    if (!callerRows[0] || callerRows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can remove members' });
    }
    // Prevent admin removing themselves
    if (user_id === req.user.id) {
      return res.status(400).json({ error: 'Admin cannot remove themselves. Transfer admin role first.' });
    }
    const { rowCount } = await client.query(
      `delete from household_members where household_id = $1 and user_id = $2`,
      [req.householdId, user_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Member not found' });
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/household/members/spending
router.get('/members/spending', async (req, res) => {
  const client = await req.householdDb.connect();
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
       where m.household_id = $1
       group by u.email, u.display_name
       order by net_expense desc`,
      [req.householdId]
    );
    return res.json({ spending: rows });
  } finally {
    client.release();
  }
});

// GET /api/household/invite-code — returns current invite code (admin only)
router.get('/invite-code', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can view the invite code' });
  }
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select invite_code from households where id = $1`,
      [req.householdId]
    );
    return res.json({ inviteCode: rows[0]?.invite_code });
  } finally {
    client.release();
  }
});

// POST /api/household/invite-code/refresh — regenerate invite code (admin only).
// Old code stops working immediately; existing members are unaffected.
router.post('/invite-code/refresh', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can refresh the invite code' });
  }
  const code = generateInviteCode();
  try {
    await masterDb.query(
      `update households_registry set invite_code = $1 where id = $2`,
      [code, req.householdId]
    );
    const client = await req.householdDb.connect();
    try {
      await client.query(`update households set invite_code = $1 where id = $2`, [code, req.householdId]);
    } finally {
      client.release();
    }
    return res.json({ inviteCode: code });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
