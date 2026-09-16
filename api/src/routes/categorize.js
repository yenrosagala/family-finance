import { Router } from 'express';
import { authRequired } from '../auth.js';
import { categorizeText } from '../services/categorizeText.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== 'string') throw Object.assign(new Error('keyword string is required'), { status: 400 });
  const result = await categorizeText(client, householdId, keyword);
  if (result.dictionary_id && (result.source === 'exact' || result.source === 'fuzzy')) {
    const isExact = result.source === 'exact';
    await client.query(
      `UPDATE item_dictionary SET times_confirmed = times_confirmed + 1, confidence = LEAST(1.0, confidence + $1), last_used = now() WHERE id = $2`,
      [isExact ? 0.05 : 0.03, result.dictionary_id]
    );
    if (isExact) result.confidence = Number(result.confidence) + 0.05;
  }
  res.json(result);
}));

router.post('/correction', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { keyword, category_id, dictionary_id } = req.body || {};
  if (!keyword || !category_id) throw Object.assign(new Error('keyword and category_id are required'), { status: 400 });
  const normalized = keyword.trim().toLowerCase();
  if (dictionary_id) {
    await client.query(
      `UPDATE item_dictionary SET category_id = $3, times_corrected = times_corrected + 1, confidence = GREATEST(0.1, confidence - 0.1), last_used = now() WHERE id = $1 AND household_id = $2`,
      [dictionary_id, householdId, category_id]
    );
  } else {
    await client.query(
      `INSERT INTO item_dictionary (household_id, keyword, normalized_keyword, category_id, source, confidence) VALUES ($1, $2, $2, $3, 'learned', 0.5)
       ON CONFLICT (household_id, keyword) DO UPDATE SET category_id = $3, source = 'learned', confidence = GREATEST(0.1, item_dictionary.confidence - 0.1), times_corrected = item_dictionary.times_corrected + 1, last_used = now()`,
      [householdId, normalized, category_id]
    );
  }
  res.json({ ok: true });
}));

export default router;
