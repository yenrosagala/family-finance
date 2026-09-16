import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold, withTransaction } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(`SELECT d.*, c.name as category_name, c.color as category_color FROM item_dictionary d LEFT JOIN categories c ON c.id = d.category_id WHERE d.household_id = $1 ORDER BY d.times_confirmed DESC, d.keyword`, [householdId]);
  res.json({ entries: rows });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { keyword, normalized_keyword, category_id, source } = req.body || {};
  if (!keyword || !category_id) throw Object.assign(new Error('keyword and category_id are required'), { status: 400 });
  const { rows } = await client.query(
    `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (household_id, keyword) DO UPDATE SET category_id = EXCLUDED.category_id, source = EXCLUDED.source RETURNING *`,
    [householdId, keyword.trim().toLowerCase(), normalized_keyword || keyword.trim().toLowerCase(), category_id, source || 'manual']
  );
  res.status(201).json({ entry: rows[0] });
}));

router.post('/bulk', authRequired, withTransaction(async (req, res, client) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0) throw Object.assign(new Error('entries array is required'), { status: 400 });
  const { rows: [{ household_id: householdId }] } = await client.query('SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1', [req.user.id]);
  if (!householdId) throw Object.assign(new Error('Not in a household yet'), { status: 403 });
  let inserted = 0;
  for (const entry of entries) {
    if (!entry.keyword || !entry.category_id) continue;
    await client.query(
      `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (household_id, keyword) DO NOTHING`,
      [householdId, entry.keyword.trim().toLowerCase(), entry.normalized_keyword || entry.keyword.trim().toLowerCase(), entry.category_id, entry.source || 'default']
    );
    inserted++;
  }
  res.status(201).json({ inserted });
}));

router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rowCount } = await client.query('DELETE FROM item_dictionary WHERE id = $1 AND household_id = $2', [req.params.id, householdId]);
  if (rowCount === 0) throw Object.assign(new Error('Entry not found'), { status: 404 });
  res.json({ ok: true });
}));

export default router;
