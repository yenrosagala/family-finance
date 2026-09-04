import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

// Helper: resolve household_id from user
async function getHouseholdId(userId) {
  const { rows } = await pool.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rows[0]?.household_id || null;
}

// GET /api/dictionary — list household dictionary entries
router.get('/', authRequired, async (req, res) => {
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const { rows } = await pool.query(
    `SELECT d.*, c.name as category_name, c.color as category_color
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1
     ORDER BY d.times_confirmed DESC, d.keyword`,
    [householdId]
  );
  return res.json({ entries: rows });
});

// POST /api/dictionary — add single entry
router.post('/', authRequired, async (req, res) => {
  const { keyword, normalized_keyword, category_id, source } = req.body || {};
  if (!keyword || !category_id) {
    return res.status(400).json({ error: 'keyword and category_id are required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const { rows } = await pool.query(
    `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (household_id, keyword) DO UPDATE
       SET category_id = EXCLUDED.category_id,
           source = EXCLUDED.source
     RETURNING *`,
    [householdId, keyword.trim().toLowerCase(), normalized_keyword || keyword.trim().toLowerCase(), category_id, source || 'manual']
  );
  return res.status(201).json({ entry: rows[0] });
});

// POST /api/dictionary/bulk — bulk insert (for seeding global defaults into a household)
router.post('/bulk', authRequired, async (req, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'entries array is required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      if (!entry.keyword || !entry.category_id) continue;
      await client.query(
        `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (household_id, keyword) DO NOTHING`,
        [householdId, entry.keyword.trim().toLowerCase(), entry.normalized_keyword || entry.keyword.trim().toLowerCase(), entry.category_id, entry.source || 'default']
      );
      inserted++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return res.status(201).json({ inserted });
});

// DELETE /api/dictionary/:id
router.delete('/:id', authRequired, async (req, res) => {
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const { rowCount } = await pool.query(
    'DELETE FROM item_dictionary WHERE id = $1 AND household_id = $2',
    [req.params.id, householdId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
  return res.json({ ok: true });
});

export default router;
