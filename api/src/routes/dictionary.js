import { Router } from 'express';

const router = Router();

// GET /api/dictionary
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `SELECT d.*, c.name as category_name, c.color as category_color
       FROM item_dictionary d LEFT JOIN categories c ON c.id = d.category_id
       WHERE d.household_id = $1 ORDER BY d.times_confirmed DESC, d.keyword`,
      [req.householdId]
    );
    return res.json({ entries: rows });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// POST /api/dictionary
router.post('/', async (req, res) => {
  const { keyword, normalized_keyword, category_id, source } = req.body || {};
  if (!keyword || !category_id)
    return res.status(400).json({ error: 'keyword and category_id are required' });
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (household_id, keyword) DO UPDATE
         SET category_id = EXCLUDED.category_id, source = EXCLUDED.source
       RETURNING *`,
      [req.householdId, keyword.trim().toLowerCase(),
       normalized_keyword || keyword.trim().toLowerCase(), category_id, source || 'manual']
    );
    return res.status(201).json({ entry: rows[0] });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// POST /api/dictionary/bulk
router.post('/bulk', async (req, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ error: 'entries array is required' });
  const client = await req.householdDb.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      if (!entry.keyword || !entry.category_id) continue;
      await client.query(
        `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (household_id, keyword) DO NOTHING`,
        [req.householdId, entry.keyword.trim().toLowerCase(),
         entry.normalized_keyword || entry.keyword.trim().toLowerCase(),
         entry.category_id, entry.source || 'default']
      );
      inserted++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
  return res.status(201).json({ inserted });
});

// DELETE /api/dictionary/:id
router.delete('/:id', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rowCount } = await client.query(
      'DELETE FROM item_dictionary WHERE id = $1 AND household_id = $2',
      [req.params.id, req.householdId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

export default router;
