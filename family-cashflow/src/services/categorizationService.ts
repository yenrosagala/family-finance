import { api } from './api';
import { Category } from '../models';
import globalDictionary from '../constants/dictionary.json';

export interface CategorizationResult {
  category_id: string | null;
  category_name: string;
  category_color: string | null;
  source: 'exact' | 'fuzzy' | 'fallback' | 'manual';
  confidence: number;
  dictionary_id: string | null;
}

// Simple token overlap + substring scoring. Kept client-side so we can
// categorize immediately (and offline) using the bundled global dictionary,
// while the authoritative networked match lives on the backend.
export function scoreMatch(input: string, target: string): number {
  const a = input.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (b.includes(a) || a.includes(b)) {
    const shorter = a.length < b.length ? a : b;
    if (shorter.length >= 4) return 0.85;
    const ratio = shorter.length / Math.max(a.length, b.length);
    return ratio > 0.4 ? 0.75 : 0;
  }
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

// Client-side categorization against the bundled global dictionary.
// This is a fast fallback when offline; the backend returns the authoritative
// household-aware result (see POST /api/categorize).
export function categorizeWithGlobalDictionary(input: string, categories: Category[]): CategorizationResult {
  const byName: Record<string, Category> = {};
  for (const c of categories) byName[c.name] = c;

  let best: { categoryId: string; name: string; color: string | null; score: number } | null = null;
  for (const entry of globalDictionary) {
    const score = scoreMatch(input, entry.keyword);
    if (score > 0.6 && (!best || score > best.score)) {
      const cat = byName[entry.category_name];
      best = {
        categoryId: cat ? cat.id : '',
        name: entry.category_name,
        color: cat ? cat.color : null,
        score,
      };
    }
  }

  if (best && best.categoryId) {
    return {
      category_id: best.categoryId,
      category_name: best.name,
      category_color: best.color,
      source: 'fuzzy',
      confidence: best.score * 0.5,
      dictionary_id: null,
    };
  }
  return {
    category_id: null,
    category_name: 'Uncategorized',
    category_color: null,
    source: 'fallback',
    confidence: 0,
    dictionary_id: null,
  };
}

// Server-authoritative categorization (household dictionary aware).
export async function categorizeKeyword(keyword: string): Promise<CategorizationResult> {
  const data = await api.post<CategorizationResult>('/api/categorize', { keyword });
  return data;
}

// Report a user correction back so the dictionary can learn.
export async function reportCorrection(keyword: string, categoryId: string, dictionaryId?: string | null) {
  await api.post('/api/categorize/correction', {
    keyword,
    category_id: categoryId,
    ...(dictionaryId ? { dictionary_id: dictionaryId } : {}),
  });
}
