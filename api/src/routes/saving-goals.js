import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(
    `select g.*, coalesce((select sum(amount)::float from savings_goal_contributions where goal_id = g.id), 0)::float as total_contributed
     from saving_goals g where g.household_id = $1 order by target_date`,
    [householdId]
  );
  res.json({ goals: rows.map((g) => ({ ...g, target_amount: Number(g.target_amount || 0), total_contributed: Number(g.total_contributed || 0) })) });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, target_amount, target_date, description } = req.body || {};
  if (!name || !target_amount || Number(target_amount) <= 0) throw Object.assign(new Error('name and positive target_amount required'), { status: 400 });
  const { rows } = await client.query(
    `insert into saving_goals (household_id, name, target_amount, target_date, description) values ($1, $2, $3, $4, $5) returning *`,
    [householdId, String(name).trim(), Number(target_amount), target_date || null, description || null]
  );
  res.status(201).json({ goal: rows[0] });
}));

router.put('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, target_amount, target_date, description } = req.body || {};
  const existing = await client.query(`select id from saving_goals where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (!existing.rows[0]) throw Object.assign(new Error('Goal not found'), { status: 404 });
  const { rows } = await client.query(
    `update saving_goals set name = coalesce($1, name), target_amount = coalesce($2, target_amount), target_date = coalesce($3, target_date), description = coalesce($4, description) where id = $5 returning *`,
    [name ? String(name).trim() : null, target_amount ? Number(target_amount) : null, target_date || null, description || null, req.params.id]
  );
  res.json({ goal: rows[0] });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const result = await client.query(`delete from saving_goals where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (result.rowCount === 0) throw Object.assign(new Error('Goal not found'), { status: 404 });
  res.json({ ok: true });
}));

export default router;
