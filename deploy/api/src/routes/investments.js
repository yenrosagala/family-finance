import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();
const TYPES = ['stock', 'bond', 'crypto', 'fund', 'other'];

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(`select * from investments where household_id = $1 order by name`, [householdId]);
  res.json({ investments: rows.map((i) => ({ ...i, current_value: Number(i.current_value || 0) })) });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, type, current_value, ticker } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type)) throw Object.assign(new Error('name and valid type required'), { status: 400 });
  const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : 0;
  const { rows } = await client.query(`insert into investments (household_id, name, type, ticker, current_value, last_updated) values ($1, $2, $3, $4, $5, $6) returning *`, [householdId, String(name).trim(), type, ticker || null, value, new Date()]);
  res.status(201).json({ investment: rows[0] });
}));

router.put('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, type, current_value, ticker } = req.body || {};
  const existing = await client.query(`select id from investments where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (!existing.rows[0]) throw Object.assign(new Error('Investment not found'), { status: 404 });
  if (type && !TYPES.includes(type)) throw Object.assign(new Error('Invalid type'), { status: 400 });
  const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : null;
  const { rows } = await client.query(`update investments set name = coalesce($1, name), type = coalesce($2, type), ticker = coalesce($3, ticker), current_value = coalesce($4, current_value), last_updated = case when $5 then now() else last_updated end where id = $6 returning *`, [String(name).trim() || null, type || null, ticker || null, value, value !== null, req.params.id]);
  res.json({ investment: rows[0] });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const result = await client.query(`delete from investments where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (result.rowCount === 0) throw Object.assign(new Error('Investment not found'), { status: 404 });
  res.json({ ok: true });
}));

export default router;
