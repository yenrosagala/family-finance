import { Router } from 'express';
import { categorizeText } from '../services/categorizeText.js';

const router = Router();

// POST /api/categorize
router.post('/', async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== 'string')
    return res.status(400).json({ error: 'keyword string is required' });

  const result = await categorizeText(req.householdDb, req.householdId, keyword);

  if (result.dictionary_id && (result.source === 'exact' || result.source === 'fuzzy')) {
    const isExact = result.source === 'exact';
    await req.householdDb.query(
      `UPDATE item_dictionary SET times_confirmed = times_confirmed + 1,
           confidence = LEAST(1.0, confidence + $1), last_used = now() WHERE id = $2`,
      [isExact ? 0.05 : 0.03, result.dictionary_id]
    );
    if (isExact) result.confidence = Number(result.confidence) + 0.05;
  }
  return res.json(result);
});

// POST /api/categorize/correction
router.post('/correction', async (req, res) => {
  const { keyword, category_id, dictionary_id } = req.body || {};
  if (!keyword || !category_id)
    return res.status(400).json({ error: 'keyword and category_id are required' });
  const normalized = keyword.trim().toLowerCase();
  if (dictionary_id) {
    await req.householdDb.query(
      `UPDATE item_dictionary SET category_id = $3, times_corrected = times_corrected + 1,
           confidence = GREATEST(0.1, confidence - 0.1), last_used = now()
       WHERE id = $1 AND household_id = $2`,
      [dictionary_id, req.householdId, category_id]
    );
  } else {
    await req.householdDb.query(
      `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source, confidence)
       VALUES ($1, $2, $2, $3, 'learned', 0.5)
       ON CONFLICT (household_id, keyword) DO UPDATE
         SET category_id = $3, source = 'learned',
             confidence = GREATEST(0.1, item_dictionary.confidence - 0.1),
             times_corrected = item_dictionary.times_corrected + 1, last_used = now()`,
      [req.householdId, normalized, category_id]
    );
  }
  return res.json({ ok: true });
});

export default router;
