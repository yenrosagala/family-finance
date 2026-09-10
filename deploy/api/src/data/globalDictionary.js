// Global default item dictionary — single source of truth is the client's
// bundled constants/dictionary.json, so household seeding and offline
// categorization never diverge. Seeded into every new household during
// creation so fuzzy/exact matching works immediately. Each keyword maps to an
// EXPENSE category by name.
import entries from './dictionary.json' with { type: 'json' };

export const GLOBAL_DICTIONARY = entries.map((e) => ({ keyword: e.keyword, category: e.category_name }));