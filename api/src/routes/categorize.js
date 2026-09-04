import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

async function getHouseholdId(userId) {
  const { rows } = await pool.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rows[0]?.household_id || null;
}

// Simple fuzzy match: check if keyword is a substring match or token overlap
function fuzzyMatch(keyword, target) {
  const a = keyword.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return 1.0;

  // Substring containment: shorter is contained in longer
  if (b.includes(a) || a.includes(b)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    // If the shorter word is >= 4 chars and is a prefix/substring, score generously
    if (shorter.length >= 4) {
      return 0.85;
    }
    const ratio = shorter.length / longer.length;
    return ratio > 0.4 ? 0.75 : 0;
  }

  // Token overlap: split on spaces, count common tokens
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let overlap = 0;
  for (const t of aTokens) {
    for (const bt of bTokens) {
      // Also check if one token is a prefix of the other (e.g. "bensin" matches "bensin")
      if (t === bt || t.startsWith(bt) || bt.startsWith(t)) {
        overlap++;
        break;
      }
    }
  }
  if (overlap > 0) {
    const ratio = overlap / Math.max(aTokens.size, bTokens.size);
    return ratio >= 0.5 ? 0.7 : 0;
  }
  return 0;
}

// POST /api/categorize — match a keyword against dictionaries, return category + source + confidence
router.post('/', authRequired, async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== 'string') {
    return res.status(400).json({ error: 'keyword string is required' });
  }
  const householdId = await getHouseholdId(req.user.id);
  if (!householdId) return res.status(403).json({ error: 'Not in a household yet' });

  const normalized = keyword.trim().toLowerCase();

  // 1. Exact match — household dictionary
  const { rows: exactRows } = await pool.query(
    `SELECT d.id, d.keyword, d.category_id, d.source, d.confidence,
            c.name as category_name, c.color as category_color, c.icon as category_icon
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1 AND d.keyword = $2`,
    [householdId, normalized]
  );
  if (exactRows[0]) {
    // Bump confidence: confirmed++
    await pool.query(
      `UPDATE item_dictionary SET times_confirmed = times_confirmed + 1,
       confidence = LEAST(1.0, confidence + 0.05), last_used = now()
       WHERE id = $1`,
      [exactRows[0].id]
    );
    return res.json({
      category_id: exactRows[0].category_id,
      category_name: exactRows[0].category_name,
      category_color: exactRows[0].category_color,
      source: 'exact',
      confidence: Number(exactRows[0].confidence) + 0.05,
      dictionary_id: exactRows[0].id,
    });
  }

  // 2. Fuzzy match — household dictionary
  const { rows: allHousehold } = await pool.query(
    `SELECT d.id, d.keyword, d.category_id, d.source, d.confidence,
            c.name as category_name, c.color as category_color
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1`,
    [householdId]
  );
  let bestFuzzy = null;
  let bestScore = 0;
  for (const entry of allHousehold) {
    const score = fuzzyMatch(normalized, entry.keyword);
    if (score > bestScore) {
      bestScore = score;
      bestFuzzy = entry;
    }
  }
  if (bestFuzzy && bestScore >= 0.6) {
    await pool.query(
      `UPDATE item_dictionary SET times_confirmed = times_confirmed + 1,
       confidence = LEAST(1.0, confidence + 0.03), last_used = now()
       WHERE id = $1`,
      [bestFuzzy.id]
    );
    return res.json({
      category_id: bestFuzzy.category_id,
      category_name: bestFuzzy.category_name,
      category_color: bestFuzzy.category_color,
      source: 'fuzzy',
      confidence: bestScore * Number(bestFuzzy.confidence),
      dictionary_id: bestFuzzy.id,
    });
  }

  // 3. Global default dictionary (source='default' rows shared across households)
  const { rows: globalDefault } = await pool.query(
    `SELECT d.keyword, d.category_id, c.name as category_name, c.color as category_color
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.source = 'default' AND d.household_id = $1
     LIMIT 200`,
    [householdId]
  );
  let bestGlobal = null;
  let bestGlobalScore = 0;
  for (const entry of globalDefault) {
    const score = fuzzyMatch(normalized, entry.keyword);
    if (score > bestGlobalScore) {
      bestGlobalScore = score;
      bestGlobal = entry;
    }
  }
  if (bestGlobal && bestGlobalScore >= 0.6) {
    return res.json({
      category_id: bestGlobal.category_id,
      category_name: bestGlobal.category_name,
      category_color: bestGlobal.category_color,
      source: 'fuzzy',
      confidence: bestGlobalScore * 0.5,
      dictionary_id: null,
    });
  }

  // 4. Fallback — Uncategorized
  return res.json({
    category_id: null,
    category_name: 'Uncategorized',
    category_color: null,
    source: 'fallback',
    confidence: 0,
    dictionary_id: null,
  });
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
