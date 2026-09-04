import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const TYPES = ['property', 'vehicle', 'other'];

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

// GET /api/assets
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query(
      `select * from assets where household_id = $1 order by name`,
      [householdId]
    );
    return res.json({ assets: rows.map((a) => ({ ...a, current_value: Number(a.current_value || 0) })) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/assets
router.post('/', authRequired, async (req, res) => {
  const { name, type, current_value } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type)) {
    return res.status(400).json({ error: 'name and a valid type are required' });
  }
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : 0;
    const { rows } = await client.query(
      `insert into assets (household_id, name, type, current_value, last_updated)
       values ($1, $2, $3, $4, $5) returning *`,
      [householdId, String(name).trim(), type, value, new Date()]
    );
    return res.status(201).json({ asset: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/assets/:id
router.put('/:id', authRequired, async (req, res) => {
  const { name, type, current_value } = req.body || {};
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const existing = await client.query(
      `select id from assets where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Asset not found' });
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid asset type' });

    const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : null;
    const { rows } = await client.query(
      `update assets
       set name = coalesce($1, name),
           type = coalesce($2, type),
           current_value = coalesce($3, current_value),
           last_updated = case when $4 then now() else last_updated end
       where id = $5 returning *`,
      [name && String(name).trim() ? String(name).trim() : null,
       type || null, value !== null ? Number(value) : null, value !== null, req.params.id]
    );
    return res.json({ asset: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/assets/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const result = await client.query(
      `delete from assets where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Asset not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
