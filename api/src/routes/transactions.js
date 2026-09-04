import { Router } from 'express';
import pool, { setCurrentUser } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

// GET /api/transactions?startDate&endDate&type&categoryId&limit
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await setCurrentUser(client, req.user.id);
    const { rows } = await client.query(
      `select household_id from household_members where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not in a household yet' });
    const householdId = rows[0].household_id;

    const { startDate, endDate, type, categoryId } = req.query;
    const params = [householdId];
    let q = `select * from transactions where household_id = $1`;
    const add = (clause, val) => { params.push(val); q += ` and ${clause} = $${params.length}`; };

    // Date filters (same column, need explicit handling)
    if (startDate) { params.push(startDate); q += ` and txn_date >= $${params.length}`; }
    if (endDate) { params.push(endDate); q += ` and txn_date <= $${params.length}`; }
    if (type) add('type', type);
    if (categoryId) add('category_id', categoryId);

    q += ` order by txn_date desc, created_at desc`;
    const limit = parseInt(req.query.limit, 10);
    if (limit && limit > 0) {
      params.push(limit);
      q += ` limit $${params.length}`;
    }

    const { rows: txns } = await client.query(q, params);
    return res.json({ transactions: txns });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/transactions
router.post('/', authRequired, async (req, res) => {
  const t = req.body || {};
  if (!t.type || !t.amount || t.amount <= 0) {
    return res.status(400).json({ error: 'type and positive amount are required' });
  }
  const client = await pool.connect();
  try {
    await setCurrentUser(client, req.user.id);
    const { rows } = await client.query(
      `select household_id from household_members where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not in a household yet' });
    const householdId = rows[0].household_id;

    const result = await client.query(
      `insert into transactions
        (household_id, type, amount, txn_date, note, added_by,
         category_id, from_account_id, to_account_id, to_person,
         investment_id, saving_goal_id, merchant_name, receipt_image_url,
         categorization_source, receipt_fingerprint)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        householdId, t.type, t.amount, t.txn_date || new Date().toISOString().slice(0,10),
        t.note || null, req.user.id,
        t.category_id || null, t.from_account_id || null, t.to_account_id || null,
        t.to_person || null, t.investment_id || null, t.saving_goal_id || null,
        t.merchant_name || null, t.receipt_image_url || null,
        t.categorization_source || 'manual', t.receipt_fingerprint || null,
      ]
    );
    return res.status(201).json({ transaction: result.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await setCurrentUser(client, req.user.id);
    const { rows } = await client.query(
      `select id from transactions where id = $1 and added_by = $2`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    await client.query(`delete from transactions where id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/transactions/summary?month=YYYY-MM — income/expense/net for dashboard
router.get('/summary', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await setCurrentUser(client, req.user.id);
    const { rows } = await client.query(
      `select household_id from household_members where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not in a household yet' });
    const householdId = rows[0].household_id;

    // month default = current month
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const range = await client.query(
      `select
         coalesce(sum(amount) filter (where type='income'), 0)::float as income,
         coalesce(sum(amount) filter (where type='expense'), 0)::float as expense
       from transactions
       where household_id = $1
         and to_char(txn_date, 'YYYY-MM') = $2`,
      [householdId, month]
    );
    const income = Number(range.rows[0]?.income || 0);
    const expense = Number(range.rows[0]?.expense || 0);
    return res.json({ summary: { income, expense, net_cashflow: income - expense, month } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
