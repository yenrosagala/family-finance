import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();
const TYPES = ['mortgage', 'auto-loan', 'student-loan', 'credit-card', 'other'];

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(`select * from liabilities where household_id = $1 order by name`, [householdId]);
  res.json({ liabilities: rows.map((l) => ({ ...l, current_balance: Number(l.current_balance || 0) })) });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, type, current_balance, interest_rate } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type)) throw Object.assign(new Error('name and valid type required'), { status: 400 });
  const balance = current_balance != null && Number(current_balance) >= 0 ? Number(current_balance) : 0;
  const rate = interest_rate != null ? Number(interest_rate) : null;
  const { rows } = await client.query(`insert into liabilities (household_id, name, type, current_balance, interest_rate, last_updated) values ($1, $2, $3, $4, $5, $6) returning *`, [householdId, String(name).trim(), type, balance, rate, new Date()]);
  res.status(201).json({ liability: rows[0] });
}));

router.put('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, type, current_balance, interest_rate } = req.body || {};
  const existing = await client.query(`select id from liabilities where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (!existing.rows[0]) throw Object.assign(new Error('Liability not found'), { status: 404 });
  if (type && !TYPES.includes(type)) throw Object.assign(new Error('Invalid type'), { status: 400 });
  const balance = current_balance != null && Number(current_balance) >= 0 ? Number(current_balance) : null;
  const rate = interest_rate != null ? Number(interest_rate) : null;
  const { rows } = await client.query(`update liabilities set name = coalesce($1, name), type = coalesce($2, type), current_balance = coalesce($3, current_balance), interest_rate = coalesce($4, interest_rate), last_updated = case when $5 then now() else last_updated end where id = $6 returning *`, [String(name).trim() || null, type || null, balance, rate, balance !== null, req.params.id]);
  res.json({ liability: rows[0] });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const result = await client.query(`delete from liabilities where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (result.rowCount === 0) throw Object.assign(new Error('Liability not found'), { status: 404 });
  res.json({ ok: true });
}));

export default router;
