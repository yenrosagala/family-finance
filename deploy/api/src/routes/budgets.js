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

// GET /api/budgets?month=YYYY-MM
// Returns budgets applicable for the month (specific month OR recurring), each with
// the month-to-date expense spend for its category, so the client can render progress.
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const { rows: budgets } = await client.query(
      `select b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
              coalesce((
                select sum(t.amount)::float
                from transactions t
                where t.household_id = b.household_id
                  and t.category_id = b.category_id
                  and t.type = 'expense'
                  and to_char(t.txn_date, 'YYYY-MM') = $2
              ), 0)::float as spent
       from budgets b
       join categories c on c.id = b.category_id
       where b.household_id = $1
         and (b.is_recurring = true or b.month = $2)
       order by c.name`,
      [householdId, month]
    );

    return res.json({
      budgets: budgets.map((b) => ({
        ...b,
        spent: Number(b.spent || 0),
        remaining: Math.max(0, Number(b.monthly_limit) - Number(b.spent || 0)),
        over_budget: Number(b.spent || 0) > Number(b.monthly_limit),
        progress: Number(b.monthly_limit) > 0
          ? Math.min(1, Number(b.spent || 0) / Number(b.monthly_limit))
          : 0,
      })),
      month,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/budgets
router.post('/', authRequired, async (req, res) => {
  const { category_id, monthly_limit, month, is_recurring, rollover } = req.body || {};
  if (!category_id || monthly_limit == null || Number(monthly_limit) <= 0) {
    return res.status(400).json({ error: 'category_id and a positive monthly_limit are required' });
  }
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);

    // Category must belong to the same household.
    const cat = await client.query(
      `select id from categories where id = $1 and household_id = $2`,
      [category_id, householdId]
    );
    if (!cat.rows[0]) return res.status(404).json({ error: 'Category not found in this household' });

    const { rows } = await client.query(
      `insert into budgets (household_id, category_id, monthly_limit, month, is_recurring, rollover, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [
        householdId, category_id, Number(monthly_limit),
        month || null,
        is_recurring == null ? true : !!is_recurring,
        !!rollover, req.user.id,
      ]
    );
    return res.status(201).json({ budget: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/budgets/:id
router.put('/:id', authRequired, async (req, res) => {
  const { monthly_limit, month, is_recurring, rollover } = req.body || {};
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const existing = await client.query(
      `select id from budgets where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Budget not found' });

    const limitVal = monthly_limit != null && Number(monthly_limit) > 0 ? Number(monthly_limit) : null;
    const { rows } = await client.query(
      `update budgets
       set monthly_limit = coalesce($1, monthly_limit),
           month = $2,
           is_recurring = coalesce($3, is_recurring),
           rollover = coalesce($4, rollover)
       where id = $5 returning *`,
      [limitVal, month ?? null, is_recurring == null ? null : !!is_recurring,
       rollover == null ? null : !!rollover, req.params.id]
    );
    return res.json({ budget: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const result = await client.query(
      `delete from budgets where id = $1 and household_id = $2`,
      [req.params.id, householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Budget not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
