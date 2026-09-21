import { Router } from 'express';

const router = Router();

// GET /api/transactions
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { startDate, endDate, type, categoryId, search, limit, offset } = req.query || {};
    const params = [req.householdId];
    let q = `select * from transactions where household_id = $1`;
    if (startDate) { params.push(startDate); q += ` and txn_date >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   q += ` and txn_date <= $${params.length}`; }
    if (type)      { params.push(type);      q += ` and type = $${params.length}`; }
    if (categoryId){ params.push(categoryId);q += ` and category_id = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`); q += ` and (merchant_name ilike $${params.length}`;
      params.push(`%${search}%`); q += ` or note ilike $${params.length})`;
    }
    q += ` order by txn_date desc, created_at desc`;
    const limitNum = parseInt(limit, 10);
    if (limitNum && limitNum > 0) { params.push(limitNum); q += ` limit $${params.length}`; }
    const offsetNum = parseInt(offset, 10);
    if (offsetNum && offsetNum > 0) { params.push(offsetNum); q += ` offset $${params.length}`; }
    const { rows: txns } = await client.query(q, params);
    return res.json({ transactions: txns.map((t) => ({ ...t, amount: Number(t.amount) })) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const t = req.body || {};
  if (!t.type || !t.amount || t.amount <= 0)
    return res.status(400).json({ error: 'type and positive amount are required' });
  const client = await req.householdDb.connect();
  try {
    const result = await client.query(
      `insert into transactions
        (household_id, type, amount, txn_date, note, added_by,
         category_id, from_account_id, to_account_id, to_person,
         investment_id, saving_goal_id, merchant_name, receipt_image_url,
         categorization_source, receipt_fingerprint)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning *`,
      [
        req.householdId, t.type, t.amount, t.txn_date || new Date().toISOString().slice(0,10),
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

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const t = req.body || {};
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select * from transactions where id = $1 and household_id = $2 limit 1`,
      [req.params.id, req.householdId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    const cur = rows[0];
    if (t.amount !== undefined && (Number(t.amount) <= 0 || Number.isNaN(Number(t.amount))))
      return res.status(400).json({ error: 'amount must be a positive number' });

    const merged = {
      type:                   t.type ?? cur.type,
      amount:                 t.amount !== undefined ? Number(t.amount) : Number(cur.amount),
      txn_date:               t.txn_date || cur.txn_date,
      note:                   t.note !== undefined ? t.note : cur.note,
      category_id:            t.category_id !== undefined ? t.category_id : cur.category_id,
      from_account_id:        t.from_account_id !== undefined ? t.from_account_id : cur.from_account_id,
      to_account_id:          t.to_account_id !== undefined ? t.to_account_id : cur.to_account_id,
      to_person:              t.to_person !== undefined ? t.to_person : cur.to_person,
      investment_id:          t.investment_id !== undefined ? t.investment_id : cur.investment_id,
      saving_goal_id:         t.saving_goal_id !== undefined ? t.saving_goal_id : cur.saving_goal_id,
      merchant_name:          t.merchant_name !== undefined ? t.merchant_name : cur.merchant_name,
      receipt_image_url:      t.receipt_image_url !== undefined ? t.receipt_image_url : cur.receipt_image_url,
      categorization_source:  t.categorization_source !== undefined ? t.categorization_source : cur.categorization_source,
      receipt_fingerprint:    t.receipt_fingerprint !== undefined ? t.receipt_fingerprint : cur.receipt_fingerprint,
    };

    const result = await client.query(
      `update transactions set
         type = $1, amount = $2, txn_date = $3, note = $4, category_id = $5,
         from_account_id = $6, to_account_id = $7, to_person = $8,
         investment_id = $9, saving_goal_id = $10, merchant_name = $11,
         receipt_image_url = $12, categorization_source = $13, receipt_fingerprint = $14
       where id = $15 returning *`,
      [
        merged.type, merged.amount, merged.txn_date, merged.note, merged.category_id,
        merged.from_account_id, merged.to_account_id, merged.to_person,
        merged.investment_id, merged.saving_goal_id, merged.merchant_name,
        merged.receipt_image_url, merged.categorization_source, merged.receipt_fingerprint,
        req.params.id,
      ]
    );
    return res.json({ transaction: { ...result.rows[0], amount: Number(result.rows[0].amount) } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select id from transactions where id = $1 and household_id = $2 and added_by = $3`,
      [req.params.id, req.householdId, req.user.id]
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

// GET /api/transactions/summary?month=YYYY-MM
router.get('/summary', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const range = await client.query(
      `select
         coalesce(sum(amount) filter (where type='income'), 0)::float as income,
         coalesce(sum(amount) filter (where type='expense'), 0)::float as expense,
         coalesce(sum(amount) filter (where type='saving'), 0)::float as saved,
         coalesce(sum(amount) filter (where type='investment'), 0)::float as invested
       from transactions where household_id = $1 and to_char(txn_date, 'YYYY-MM') = $2`,
      [req.householdId, month]
    );
    const income = Number(range.rows[0]?.income || 0);
    const expense = Number(range.rows[0]?.expense || 0);
    return res.json({ summary: { income, expense, net_cashflow: income - expense,
      saved: Number(range.rows[0]?.saved || 0), invested: Number(range.rows[0]?.invested || 0), month } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/transactions/series?bucket=day|week|month&categoryId=
router.get('/series', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const bucket = req.query.bucket === 'week' ? 'week' : req.query.bucket === 'month' ? 'month' : 'day';
    const expr  = bucket === 'week' ? `date_trunc('week', txn_date)` : bucket === 'month' ? `date_trunc('month', txn_date)` : `date_trunc('day', txn_date)`;
    const label = bucket === 'week' ? `to_char(date_trunc('week', txn_date), 'YYYY-MM-DD')` : bucket === 'month' ? `to_char(date_trunc('month', txn_date), 'YYYY-MM')` : `to_char(date_trunc('day', txn_date), 'YYYY-MM-DD')`;
    const fallbackStart = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const startDate = req.query.startDate || fallbackStart;
    const endDate   = req.query.endDate   || new Date().toISOString().slice(0, 10);
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : null;
    if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return res.status(400).json({ error: 'Invalid categoryId' });
    }
    const { rows: series } = await client.query(
      `select ${label} as label,
              coalesce(sum(amount) filter (where type='income'), 0)::float as income,
              coalesce(sum(amount) filter (where type='expense'), 0)::float as expense,
              coalesce(sum(amount) filter (where type='saving'), 0)::float as saved,
              coalesce(sum(amount) filter (where type='investment'), 0)::float as invested
       from transactions
       where household_id = $1 and txn_date >= $2::date and txn_date < $3::date + interval '1 day'
         and ($4::uuid is null or category_id = $4)
       group by ${expr} order by ${expr}`,
      [req.householdId, startDate, endDate, categoryId]
    );
    return res.json({ series, bucket });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/transactions/breakdown?month=YYYY-MM&type=expense
router.get('/breakdown', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const type = req.query.type === 'income' ? 'income' : 'expense';
    const startDate = req.query.startDate;
    const endDate   = req.query.endDate;
    const dateFilter = startDate && endDate
      ? `t.txn_date >= $3::date and t.txn_date < $4::date + interval '1 day'`
      : `to_char(t.txn_date, 'YYYY-MM') = $3`;
    const params = startDate && endDate
      ? [req.householdId, type, startDate, endDate]
      : [req.householdId, type, month];
    const { rows: breakdown } = await client.query(
      `select c.id, c.name, c.color, c.icon, coalesce(sum(t.amount), 0)::float as total
       from transactions t join categories c on c.id = t.category_id
       where t.household_id = $1 and t.type = $2 and t.category_id is not null and ${dateFilter}
       group by c.id, c.name, c.color, c.icon order by total desc`,
      params
    );
    return res.json({ breakdown, month, type });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
