import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { startDate, endDate, type, categoryId, search, limit } = req.query || {};
  const params = [householdId];
  let q = `select * from transactions where household_id = $1`;
  if (startDate) { params.push(startDate); q += ` and txn_date >= $${params.length}`; }
  if (endDate) { params.push(endDate); q += ` and txn_date <= $${params.length}`; }
  if (type) { params.push(type); q += ` and type like $${params.length}`; }
  if (categoryId) { params.push(categoryId); q += ` and category_id like $${params.length}`; }
  if (search) { params.push(`%${search}%`); q += ` and merchant_name ilike $${params.length}`; params.push(`%${search}%`); q += ` and note ilike $${params.length}`; }
  q += ` order by txn_date desc, created_at desc`;
  const limitNum = parseInt(limit, 10);
  if (limitNum && limitNum > 0) { params.push(limitNum); q += ` limit $${params.length}`; }
  const { rows: txns } = await client.query(q, params);
  res.json({ transactions: txns.map((t) => ({ ...t, amount: Number(t.amount) })) });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const t = req.body || {};
  if (!t.type || !t.amount || t.amount <= 0) throw Object.assign(new Error('type and positive amount are required'), { status: 400 });
  const result = await client.query(
    `insert into transactions (household_id, type, amount, txn_date, note, added_by, category_id, from_account_id, to_account_id, to_person, investment_id, saving_goal_id, merchant_name, receipt_image_url, categorization_source, receipt_fingerprint) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [householdId, t.type, t.amount, t.txn_date || new Date().toISOString().slice(0,10), t.note || null, req.user.id, t.category_id || null, t.from_account_id || null, t.to_account_id || null, t.to_person || null, t.investment_id || null, t.saving_goal_id || null, t.merchant_name || null, t.receipt_image_url || null, t.categorization_source || 'manual', t.receipt_fingerprint || null]
  );
  res.status(201).json({ transaction: result.rows[0] });
}));

router.put('/:id', authRequired, withHousehold(async (req, res, client) => {
  const t = req.body || {};
  const { rows } = await client.query(`select t.* from transactions t join household_members hm on hm.household_id = t.household_id where t.id = $1 and hm.user_id = $2 limit 1`, [req.params.id, req.user.id]);
  if (!rows[0]) throw Object.assign(new Error('Transaction not found'), { status: 404 });
  const cur = rows[0];
  if (t.amount !== undefined && (Number(t.amount) <= 0 || Number.isNaN(Number(t.amount)))) throw Object.assign(new Error('amount must be a positive number'), { status: 400 });
  const merged = { type: t.type ?? cur.type, amount: t.amount !== undefined ? Number(t.amount) : Number(cur.amount), txn_date: t.txn_date || cur.txn_date, note: t.note !== undefined ? t.note : cur.note, category_id: t.category_id !== undefined ? t.category_id : cur.category_id, from_account_id: t.from_account_id !== undefined ? t.from_account_id : cur.from_account_id, to_account_id: t.to_account_id !== undefined ? t.to_account_id : cur.to_account_id, to_person: t.to_person !== undefined ? t.to_person : cur.to_person, investment_id: t.investment_id !== undefined ? t.investment_id : cur.investment_id, saving_goal_id: t.saving_goal_id !== undefined ? t.saving_goal_id : cur.saving_goal_id, merchant_name: t.merchant_name !== undefined ? t.merchant_name : cur.merchant_name, receipt_image_url: t.receipt_image_url !== undefined ? t.receipt_image_url : cur.receipt_image_url, categorization_source: t.categorization_source !== undefined ? t.categorization_source : cur.categorization_source, receipt_fingerprint: t.receipt_fingerprint !== undefined ? t.receipt_fingerprint : cur.receipt_fingerprint };
  const result = await client.query(`update transactions set type = $1, amount = $2, txn_date = $3, note = $4, category_id = $5, from_account_id = $6, to_account_id = $7, to_person = $8, investment_id = $9, saving_goal_id = $10, merchant_name = $11, receipt_image_url = $12, categorization_source = $13, receipt_fingerprint = $14 where id = $15 returning *`, [merged.type, merged.amount, merged.txn_date, merged.note, merged.category_id, merged.from_account_id, merged.to_account_id, merged.to_person, merged.investment_id, merged.saving_goal_id, merged.merchant_name, merged.receipt_image_url, merged.categorization_source, merged.receipt_fingerprint, req.params.id]);
  res.json({ transaction: { ...result.rows[0], amount: Number(result.rows[0].amount) } });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client) => {
  const { rows } = await client.query(`select id from transactions where id = $1 and added_by = $2`, [req.params.id, req.user.id]);
  if (!rows[0]) throw Object.assign(new Error('Transaction not found'), { status: 404 });
  await client.query(`delete from transactions where id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

router.get('/summary', authRequired, withHousehold(async (req, res, client, householdId) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const range = await client.query(`select coalesce(sum(amount) filter (where type='income'), 0)::float as income, coalesce(sum(amount) filter (where type='expense'), 0)::float as expense, coalesce(sum(amount) filter (where type='saving'), 0)::float as saved, coalesce(sum(amount) filter (where type='investment'), 0)::float as invested from transactions where household_id = $1 and to_char(txn_date, 'YYYY-MM') = $2`, [householdId, month]);
  const income = Number(range.rows[0]?.income || 0);
  const expense = Number(range.rows[0]?.expense || 0);
  const saved = Number(range.rows[0]?.saved || 0);
  const invested = Number(range.rows[0]?.invested || 0);
  res.json({ summary: { income, expense, net_cashflow: income - expense, saved, invested, month } });
}));

router.get('/series', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(`select to_char(txn_date, 'YYYY-MM-DD') as date, type, coalesce(sum(amount), 0)::float as total from transactions where household_id = $1 group by to_char(txn_date, 'YYYY-MM-DD'), type order by date`, [householdId]);
  res.json({ series: rows.map((r) => ({ ...r, total: Number(r.total) })) });
}));

router.get('/breakdown', authRequired, withHousehold(async (req, res, client, householdId) => {
  const type = req.query.type || 'expense';
  const { rows } = await client.query(`select c.name, coalesce(sum(t.amount), 0)::float as amount from transactions t left join categories c on c.id = t.category_id where t.household_id = $1 and t.type = $2 group by c.name order by amount desc`, [householdId, type]);
  res.json({ breakdown: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
}));

export default router;