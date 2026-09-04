import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

async function requireHousehold(client, userId) {
  const { rows } = await client.query(
    `select household_id from household_members where user_id = $1 limit 1`,
    [userId]
  );
  if (!rows[0]) {
    const e = new Error('You are not in a household yet');
    e.status = 403;
    throw e;
  }
  return rows[0].household_id;
}

// GET /api/accounts
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query(
      `select * from accounts where household_id = $1 and is_active = true order by name`,
      [householdId]
    );
    return res.json({ accounts: rows });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/accounts
router.post('/', authRequired, async (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query(
      `insert into accounts (household_id, name, type, currency)
       values ($1, $2, $3, $4) returning *`,
      [householdId, String(name).trim(), type, req.body.currency || 'IDR']
    );
    return res.status(201).json({ account: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { household_id } = await client.query(
      `select household_id from accounts where id = $1`,
      [req.params.id]
    ).then((r) => r.rows[0] || {});
    if (!household_id) return res.status(404).json({ error: 'Account not found' });
    // soft-deactivate
    await client.query(`update accounts set is_active = false where id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
