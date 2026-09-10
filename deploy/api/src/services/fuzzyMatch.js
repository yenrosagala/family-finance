// Token-overlap + substring similarity used by both the API fuzzy cascade
// (api/src/services/categorizeText.js) and the offline classifier
// (src/services/categorizationService.ts) so they score identically.
export function fuzzyMatch(keyword, target) {
  const a = keyword.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (!a || !b) return 0;
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