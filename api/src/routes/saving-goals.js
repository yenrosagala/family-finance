import { Router } from 'express';

const router = Router();

// GET /api/saving-goals
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows: goals } = await client.query(
      `select g.*, a.name as account_name
       from saving_goals g
       left join accounts a on a.id = g.linked_account_id
       where g.household_id = $1
       order by g.created_at`,
      [req.householdId]
    );
    return res.json({
      goals: goals.map((g) => ({
        ...g,
        current_amount: Number(g.current_amount || 0),
        target_amount: Number(g.target_amount || 0),
        progress: g.target_amount > 0 ? Math.min(1, Number(g.current_amount || 0) / g.target_amount) : 0,
        remaining: Math.max(0, Number(g.target_amount) - Number(g.current_amount || 0)),
      })),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/saving-goals
router.post('/', async (req, res) => {
  const { name, target_amount, target_date, linked_account_id } = req.body || {};
  if (!name || !name.trim() || target_amount == null || Number(target_amount) <= 0) {
    return res.status(400).json({ error: 'name and a positive target_amount are required' });
  }
  const client = await req.householdDb.connect();
  try {
    if (linked_account_id) {
      const acc = await client.query(
        `select id from accounts where id = $1 and household_id = $2`,
        [linked_account_id, req.householdId]
      );
      if (!acc.rows[0]) return res.status(404).json({ error: 'Linked account not found in this household' });
    }
    const { rows } = await client.query(
      `insert into saving_goals (household_id, name, target_amount, target_date, linked_account_id)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.householdId, String(name).trim(), Number(target_amount), target_date || null, linked_account_id || null]
    );
    return res.status(201).json({ goal: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /api/saving-goals/:id
router.put('/:id', async (req, res) => {
  const { name, target_amount, target_date, linked_account_id } = req.body || {};
  const client = await req.householdDb.connect();
  try {
    const existing = await client.query(
      `select id from saving_goals where id = $1 and household_id = $2`,
      [req.params.id, req.householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Saving goal not found' });
    if (linked_account_id) {
      const acc = await client.query(
        `select id from accounts where id = $1 and household_id = $2`,
        [linked_account_id, req.householdId]
      );
      if (!acc.rows[0]) return res.status(404).json({ error: 'Linked account not found in this household' });
    }
    const targetVal = target_amount != null && Number(target_amount) > 0 ? Number(target_amount) : null;
    const { rows } = await client.query(
      `update saving_goals
       set name = coalesce($1, name),
           target_amount = coalesce($2, target_amount),
           target_date = $3,
           linked_account_id = $4
       where id = $5 returning *`,
      [name && String(name).trim() ? String(name).trim() : null, targetVal,
       target_date ?? null, linked_account_id ?? null, req.params.id]
    );
    return res.json({ goal: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/saving-goals/:id
router.delete('/:id', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const result = await client.query(
      `delete from saving_goals where id = $1 and household_id = $2`,
      [req.params.id, req.householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Saving goal not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
