import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const TYPES = ['stocks', 'mutual_fund', 'gold', 'crypto', 'property', 'other'];

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

// GET /api/investments
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows: investments } = await client.query(
      `select * from investments where household_id = $1 order by created_at`,
      [householdId]
    );
    return res.json({
      investments: investments.map((i) => ({
        ...i,
        total_invested: Number(i.total_invested || 0),
        current_value: Number(i.current_value || 0),
        gain_loss: Number(i.current_value || 0) - Number(i.total_invested || 0),
        gain_loss_pct: Number(i.total_invested) > 0
          ? (Number(i.current_value) - Number(i.total_invested)) / Number(i.total_invested)
          : 0,
      })),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/investments — create with an optional starting balance
router.post('/', authRequired, async (req, res) => {
  const { name, type, current_value } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type)) {
    return res.status(400).json({ error: 'name and a valid type are required' });
  }
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const startingValue = current_value != null && Number(current_value) >= 0 ? Number(current_value) : 0;
    const { rows } = await client.query(
      `insert into investments (household_id, name, type, total_invested, current_value, last_updated)
       values ($1, $2, $3, 0, $4, $5) returning *`,
      [householdId, String(name).trim(), type, startingValue,
       startingValue > 0 ? new Date() : null]
    );
    return res.status(201).json({ investment: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/investments/:id — update metadata or do a manual mark-to-market (current_value)
router.put('/:id', authRequired, async (req, res) => {
  const { name, type, current_value } = req.body || {};
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const existing = await client.query(
      `select id from investments where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Investment not found' });
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid investment type' });

    const targetVal = current_value != null && Number(current_value) >= 0 ? Number(current_value) : null;
    const { rows } = await client.query(
      `update investments
       set name = coalesce($1, name),
           type = coalesce($2, type),
           current_value = coalesce($3, current_value),
           last_updated = case when $4 then now() else last_updated end
       where id = $5 returning *`,
      [name && String(name).trim() ? String(name).trim() : null,
       type || null, targetVal !== null ? Number(targetVal) : null,
       targetVal !== null, req.params.id]
    );
    return res.json({ investment: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/investments/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const result = await client.query(
      `delete from investments where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Investment not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
