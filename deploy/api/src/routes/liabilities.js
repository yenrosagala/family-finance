import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const TYPES = ['mortgage', 'loan', 'credit_card', 'other'];

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

// GET /api/liabilities
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query(
      `select * from liabilities where household_id = $1 order by name`,
      [householdId]
    );
    return res.json({
      liabilities: rows.map((l) => ({
        ...l,
        current_balance: Number(l.current_balance || 0),
        original_amount: l.original_amount == null ? null : Number(l.original_amount),
        interest_rate: l.interest_rate == null ? null : Number(l.interest_rate),
      })),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/liabilities
router.post('/', authRequired, async (req, res) => {
  const { name, type, current_balance, original_amount, interest_rate } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type)) {
    return res.status(400).json({ error: 'name and a valid type are required' });
  }
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const balance = current_balance != null && Number(current_balance) >= 0 ? Number(current_balance) : 0;
    const { rows } = await client.query(
      `insert into liabilities
         (household_id, name, type, current_balance, original_amount, interest_rate, last_updated)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [householdId, String(name).trim(), type, balance,
       original_amount == null ? null : Number(original_amount),
       interest_rate == null ? null : Number(interest_rate), new Date()]
    );
    return res.status(201).json({ liability: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/liabilities/:id
router.put('/:id', authRequired, async (req, res) => {
  const { name, type, current_balance, original_amount, interest_rate } = req.body || {};
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const existing = await client.query(
      `select id from liabilities where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Liability not found' });
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid liability type' });

    const balance = current_balance != null && Number(current_balance) >= 0 ? Number(current_balance) : null;
    const { rows } = await client.query(
      `update liabilities
       set name = coalesce($1, name),
           type = coalesce($2, type),
           current_balance = coalesce($3, current_balance),
           original_amount = $4,
           interest_rate = $5,
           last_updated = case when $6 then now() else last_updated end
       where id = $7 returning *`,
      [name && String(name).trim() ? String(name).trim() : null,
       type || null, balance !== null ? Number(balance) : null,
       original_amount === undefined ? null : (original_amount == null ? null : Number(original_amount)),
       interest_rate === undefined ? null : (interest_rate == null ? null : Number(interest_rate)),
       balance !== null, req.params.id]
    );
    return res.json({ liability: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/liabilities/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const result = await client.query(
      `delete from liabilities where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Liability not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
