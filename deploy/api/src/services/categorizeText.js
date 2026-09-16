// Simplified categorization: exact + fuzzy + fallback.
// ponytail: removed ML classifier (add back if A/B test shows benefit).
// Single DB fetch for all household data instead of 3 queries.

export function fuzzyMatch(keyword, target) {
  const a = keyword.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return 1.0;
  if (b.includes(a) || a.includes(b)) {
    const shorter = a.length < b.length ? a : b;
    return shorter.length >= 4 ? 0.85 : 0.75;
  }
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = new Set(b.split(/\s+/));
  let overlap = Array.from(aTokens).filter(t => Array.from(bTokens).some(bt => t === bt || t.startsWith(bt) || bt.startsWith(t))).length;
  return overlap > 0 ? (overlap / Math.max(aTokens.size, bTokens.size)) >= 0.5 ? 0.7 : 0 : 0;
}

export async function categorizeText(pool, householdId, normalized) {
  const keyword = normalized.trim().toLowerCase();

  // Single query: all household dictionary entries.
  const { rows } = await pool.query(
    `SELECT d.id, d.keyword, d.category_id, d.confidence, c.name as category_name, c.color as category_color
     FROM item_dictionary d LEFT JOIN categories c ON c.id = d.category_id
     WHERE d.household_id = $1 ORDER BY d.confidence DESC`,
    [householdId]
  );

  // Exact match first.
  const exact = rows.find(r => r.keyword.toLowerCase() === keyword);
  if (exact) {
    return { category_id: exact.category_id, category_name: exact.category_name, category_color: exact.category_color, source: 'exact', confidence: Number(exact.confidence), dictionary_id: exact.id };
  }

  // Fuzzy match on highest-confidence entries.
  let best = null, bestScore = 0;
  for (const row of rows.slice(0, 100)) {
    const score = fuzzyMatch(keyword, row.keyword);
    if (score > bestScore) { bestScore = score; best = row; }
  }
  if (best && bestScore >= 0.6) {
    return { category_id: best.category_id, category_name: best.category_name, category_color: best.category_color, source: 'fuzzy', confidence: bestScore * Number(best.confidence), dictionary_id: best.id };
  }

  // Fallback.
  return { category_id: null, category_name: 'Uncategorized', category_color: null, source: 'fallback', confidence: 0, dictionary_id: null };
}
