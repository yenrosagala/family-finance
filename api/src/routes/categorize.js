import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';
import { categorizeText } from '../services/categorizeText.js';

const router = Router();

async function getHouseholdId(userId) {
  const { rows } = await pool.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rows[0]?.household_id || null;
}

// POST /api/categorize — match a keyword against dictionaries, return category + source + confidence
router.post('/', authRequired, async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== 'string') {
    return res.status(400).json({ error: 'keyword string is required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const result = await categorizeText(pool, householdId, keyword);

  // Learning: bump confirmation counts for dictionary-backed matches (exact/fuzzy).
  if (result.dictionary_id && (result.source === 'exact' || result.source === 'fuzzy')) {
    const isExact = result.source === 'exact';
    await pool.query(
      `UPDATE item_dictionary
       SET times_confirmed = times_confirmed + 1,
           confidence = LEAST(1.0, confidence + $1), last_used = now()
       WHERE id = $2`,
      [isExact ? 0.05 : 0.03, result.dictionary_id]
    );
    // Exact branch historically reports post-bump confidence.
    if (isExact) result.confidence = Number(result.confidence) + 0.05;
  }

  return res.json(result);
});

// POST /api/categorize/correction — user corrects a categorization
router.post('/correction', authRequired, async (req, res) => {
  const { keyword, category_id, dictionary_id } = req.body || {};
  if (!keyword || !category_id) {
    return res.status(400).json({ error: 'keyword and category_id are required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const normalized = keyword.trim().toLowerCase();

  if (dictionary_id) {
    // Update existing dictionary entry — confidence drops, learned category
    await pool.query(
      `UPDATE item_dictionary
       SET category_id = $3, times_corrected = times_corrected + 1,
           confidence = GREATEST(0.1, confidence - 0.1), last_used = now()
       WHERE id = $1 AND household_id = $2`,
      [dictionary_id, householdId, category_id]
    );
  } else {
    // Create or update a 'learned' entry for this keyword
    await pool.query(
      `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source, confidence)
       VALUES ($1, $2, $2, $3, 'learned', 0.5)
       ON CONFLICT (household_id, keyword) DO UPDATE
         SET category_id = $3, source = 'learned',
             confidence = GREATEST(0.1, item_dictionary.confidence - 0.1),
             times_corrected = item_dictionary.times_corrected + 1,
             last_used = now()`,
      [householdId, normalized, category_id]
    );
  }

  return res.json({ ok: true });
});

export default router;
