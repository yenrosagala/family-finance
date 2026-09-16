import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { rows: budgets } = await client.query(
    `select b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
            coalesce((select sum(t.amount)::float from transactions t
              where t.household_id = b.household_id and t.category_id = b.category_id
                and t.type = 'expense' and to_char(t.txn_date, 'YYYY-MM') = $2), 0)::float as spent
     from budgets b join categories c on c.id = b.category_id
     where b.household_id = $1 and (b.is_recurring = true or b.month = $2) order by c.name`,
    [householdId, month]
  );
  res.json({
    budgets: budgets.map((b) => ({
      ...b, spent: Number(b.spent || 0),
      remaining: Math.max(0, Number(b.monthly_limit) - Number(b.spent || 0)),
      over_budget: Number(b.spent || 0) > Number(b.monthly_limit),
      progress: Number(b.monthly_limit) > 0 ? Math.min(1, Number(b.spent || 0) / Number(b.monthly_limit)) : 0,
    })),
    month,
  });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { category_id, monthly_limit, month, is_recurring, rollover } = req.body || {};
  if (!category_id || monthly_limit == null || Number(monthly_limit) <= 0) {
    throw Object.assign(new Error('category_id and a positive monthly_limit are required'), { status: 400 });
  }
  const cat = await client.query(`select id from categories where id = $1 and household_id = $2`, [category_id, householdId]);
  if (!cat.rows[0]) throw Object.assign(new Error('Category not found in this household'), { status: 404 });
  const { rows } = await client.query(
    `insert into budgets (household_id, category_id, monthly_limit, month, is_recurring, rollover, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [householdId, category_id, Number(monthly_limit), month || null, is_recurring == null ? true : !!is_recurring, !!rollover, req.user.id]
  );
  res.status(201).json({ budget: rows[0] });
}));

router.put('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { monthly_limit, month, is_recurring, rollover } = req.body || {};
  const existing = await client.query(`select id from budgets where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (!existing.rows[0]) throw Object.assign(new Error('Budget not found'), { status: 404 });
  const limitVal = monthly_limit != null && Number(monthly_limit) > 0 ? Number(monthly_limit) : null;
  const { rows } = await client.query(
    `update budgets set monthly_limit = coalesce($1, monthly_limit), month = $2, is_recurring = coalesce($3, is_recurring), rollover = coalesce($4, rollover) where id = $5 returning *`,
    [limitVal, month ?? null, is_recurring == null ? null : !!is_recurring, rollover == null ? null : !!rollover, req.params.id]
  );
  res.json({ budget: rows[0] });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const result = await client.query(`delete from budgets where id = $1 and household_id = $2`, [req.params.id, householdId]);
  if (result.rowCount === 0) throw Object.assign(new Error('Budget not found'), { status: 404 });
  res.json({ ok: true });
}));

export default router;
