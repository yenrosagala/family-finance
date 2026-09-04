// Shared categorization for a single normalized keyword against a household's
// dictionaries. Used by both `POST /api/categorize` and `POST /api/receipt/parse`
// so that scanning benefits from the exact same ML-augmented chain:
//   exact (household) -> fuzzy (household) -> global default -> ML -> fallback
//
// Pure lookup: does NOT bump confirmation counts or write to item_dictionary.
// Callers decide whether/how to apply learning (confirm/correct).

import { GLOBAL_DICTIONARY } from '../data/globalDictionary.js';
import { classifyBayes, trainBayes } from '../ml/classifier.js';

export function fuzzyMatch(keyword, target) {
  const a = keyword.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return 1.0;

  // Substring containment: shorter is contained in longer
  if (b.includes(a) || a.includes(b)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (shorter.length >= 4) return 0.85;
    const ratio = shorter.length / longer.length;
    return ratio > 0.4 ? 0.75 : 0;
  }

  // Token overlap
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let overlap = 0;
  for (const t of aTokens) {
    for (const bt of bTokens) {
      if (t === bt || t.startsWith(bt) || bt.startsWith(t)) { overlap++; break; }
    }
  }
  if (overlap > 0) {
    const ratio = overlap / Math.max(aTokens.size, bTokens.size);
    return ratio >= 0.5 ? 0.7 : 0;
  }
  return 0;
}

// ML decision threshold (log-likelihood margin) — fires only when the model is
// genuinely confident, to avoid noisy suggestions near ties.
export const ML_MARGIN_THRESHOLD = 0.35;

function buildMlModel(allHousehold) {
  const mlLabels = GLOBAL_DICTIONARY.map((g) => ({ keyword: g.keyword, categoryName: g.category, weight: 1 }));
  for (const entry of allHousehold) {
    if (!entry.category_name) continue;
    const confirmedWeight = Math.max(1, (entry.times_confirmed || 0) + 1);
    const sourceWeight = entry.source === 'learned' ? 1.5 : 1;
    mlLabels.push({ keyword: entry.keyword, categoryName: entry.category_name, weight: confirmedWeight * sourceWeight });
  }
  return trainBayes(mlLabels);
}

// Returns { category_id, category_name, category_color, source, confidence, dictionary_id }
export async function categorizeText(pool, householdId, normalized) {
  const normalizedKeyword = normalized.trim().toLowerCase();

  // 1. Exact match - household dictionary
  const { rows: exactRows } = await pool.query(
    `SELECT d.id, d.keyword, d.category_id, d.source, d.confidence, d.times_confirmed,
            c.name as category_name, c.color as category_color
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1 AND d.keyword = $2`,
    [householdId, normalizedKeyword]
  );
  if (exactRows[0]) {
    return {
      category_id: exactRows[0].category_id,
      category_name: exactRows[0].category_name,
      category_color: exactRows[0].category_color,
      source: 'exact',
      confidence: Number(exactRows[0].confidence),
      dictionary_id: exactRows[0].id,
    };
  }

  // Fetch all household entries once (used by fuzzy + ML + name->id map)
  const { rows: allHousehold } = await pool.query(
    `SELECT d.id, d.keyword, d.category_id, d.source, d.confidence, d.times_confirmed,
            c.name as category_name, c.color as category_color
     FROM item_dictionary d
     LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1`,
    [householdId]
  );

  // 2. Fuzzy match - household dictionary
  let bestFuzzy = null;
  let bestScore = 0;
  for (const entry of allHousehold) {
    const score = fuzzyMatch(normalizedKeyword, entry.keyword);
    if (score > bestScore) { bestScore = score; bestFuzzy = entry; }
  }
  if (bestFuzzy && bestScore >= 0.6) {
    return {
      category_id: bestFuzzy.category_id,
      category_name: bestFuzzy.category_name,
      category_color: bestFuzzy.category_color,
      source: 'fuzzy',
      confidence: bestScore * Number(bestFuzzy.confidence),
      dictionary_id: bestFuzzy.id,
    };
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
    const score = fuzzyMatch(normalizedKeyword, entry.keyword);
    if (score > bestGlobalScore) { bestGlobalScore = score; bestGlobal = entry; }
  }
  if (bestGlobal && bestGlobalScore >= 0.6) {
    return {
      category_id: bestGlobal.category_id,
      category_name: bestGlobal.category_name,
      category_color: bestGlobal.category_color,
      source: 'fuzzy',
      confidence: bestGlobalScore * 0.5,
      dictionary_id: null,
    };
  }

  // 3.5 ML category classifier (only when nothing confident matched above)
  const nameToId = {};
  for (const entry of allHousehold) {
    if (!entry.category_name) continue;
    if (!nameToId[entry.category_name]) nameToId[entry.category_name] = entry.category_id;
  }
  const prediction = classifyBayes(buildMlModel(allHousehold), normalizedKeyword);
  if (prediction && prediction.margin >= ML_MARGIN_THRESHOLD && nameToId[prediction.categoryName]) {
    return {
      category_id: nameToId[prediction.categoryName],
      category_name: prediction.categoryName,
      category_color: allHousehold.find((e) => e.category_name === prediction.categoryName)?.category_color ?? null,
      source: 'ml',
      confidence: Number(prediction.confidence.toFixed(3)),
      dictionary_id: null,
    };
  }

  // 4. Fallback
  return {
    category_id: null,
    category_name: 'Uncategorized',
    category_color: null,
    source: 'fallback',
    confidence: 0,
    dictionary_id: null,
  };
}
