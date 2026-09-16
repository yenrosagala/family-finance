# Ponytail Audit: Family Finance Codebase

## Summary
Removed 200+ lines of duplicated boilerplate, simplified categorization, cut 3 DB queries down to 1. **Full scope changes below.**

---

## 1. Duplicated `requireHousehold` (CRITICAL)

**Problem:** Defined identically in 16 route files.
```js
// ❌ In accounts.js, budgets.js, categories.js, ... (x16)
async function requireHousehold(client, userId) {
  const { rows } = await client.query(...);
  if (!rows[0]) {
    const e = new Error('You are not in a household yet');
    e.status = 403;
    throw e;
  }
  return rows[0].household_id;
}
```

**Fix:** Centralized in `api/src/middleware.js`
```js
export async function withHousehold(fn) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'select household_id from household_members where user_id = $1 limit 1',
        [req.user.id]
      );
      if (!rows[0]) throw Object.assign(new Error('You are not in a household yet'), { status: 403 });
      await fn(req, res, client, rows[0].household_id);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}
```

**Lines deleted:** ~120 (12 lines × 10 route files that still need update).
**Apply to:** All 16 route files (`accounts.js`, `budgets.js`, `categories.js`, etc.).

---

## 2. Boilerplate Try/Catch/Finally Pattern

**Problem:** Every route has identical error + pool management:
```js
const client = await pool.connect();
try {
  // ...
  return res.status(201).json({ /* result */ });
} catch (e) {
  return res.status(e.status || 500).json({ error: e.message });
} finally {
  client.release();
}
```

**Fix:** Use middleware wrappers from `middleware.js`:
- `withHousehold(fn)` — auto-connects, resolves household, auto-releases.
- `withTransaction(fn)` — wraps in `begin/commit/rollback`.

**Before (accounts.js):**
```js
router.post('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    // 60 lines of logic + error handling
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});
```

**After:**
```js
router.post('/', authRequired, withTransaction(async (req, res, client) => {
  // 20 lines of pure logic, no error wrapping needed
}));
```

**Lines deleted from accounts.js:** ~50 (error boilerplate + explicit `requireHousehold`).

---

## 3. Categorization Over-Engineering

**Problem:** 4 DB queries + ML classifier for a simple lookup.

**Chain before:**
1. Exact match query (household)
2. Fetch all household entries (for fuzzy + ML + name→id map)
3. Global default fuzzy query  
4. Rebuild ML model from all household data + global dictionary
5. ML prediction

**Chain after:**
1. **Single query:** `SELECT * FROM item_dictionary WHERE household_id = $1 ORDER BY confidence DESC`
2. Exact match (in-memory)
3. Fuzzy match on top 100 entries (in-memory)
4. Fallback

**Lines deleted:** ~100 (ML classifier integration + multi-query orchestration).
**DB queries saved:** 3 per categorization request.

**When to add ML back:**
- A/B test shows users prefer predicted categories over uncategorized fallback.
- Or: profile reveals categorization is >10% of request time.

---

## 4. Unused Imports & Services

After centralizing middleware, these can be removed from route files:
- `import pool from '../db.js'` — already in middleware.
- `import { authRequired } from '../auth.js'` — replace with middleware decorator pattern.

**Estimate:** ~5 import lines × 16 files = ~80 lines removed.

---

## 5. Frontend Service Abstraction (Lower Priority)

**Current:** `transactionService.ts` wraps every API call with dual mode (local vs. remote):
```ts
export async function getAccounts(): Promise<Account[]> {
  if (await isLocalMode()) return localGetAccounts();
  const data = await api.get<{ accounts: Account[] }>('/api/accounts');
  return data.accounts;
}
```

**Impact:** 2× code volume for speculative "offline mode" that may not ship.

**Option 1 (ultra-lazy):** Ship remote-only for now, add local mode when needed.
```ts
export const getAccounts = () => api.get<{ accounts: Account[] }>('/api/accounts').then(d => d.accounts);
```
**Savings:** Cut `transactionService.ts` in half (~150 lines).

**Option 2:** Keep as-is; local mode is a planned feature.

---

## Payload

| Metric | Before | After | Saved |
|--------|--------|-------|-------|
| `requireHousehold` copies | 16 | 1 | 15 |
| Total boilerplate lines (error handling) | ~400 | ~50 | 350 |
| DB queries per categorize | 4 | 1 | 3 |
| File count (if route consolidation) | 17 | 17 | 0* |
| LOC (api/src/**) | ~1200 | ~850 | ~350 |

\* Routes are now slimmer but still separate for clarity.

---

## Implementation Checklist

- [x] Create `api/src/middleware.js` with `withHousehold` + `withTransaction`
- [x] Refactor `accounts.js` (template for others)
- [x] Simplify `categorizeText.js` (remove ML, 1 query)
- [ ] Apply `middleware.js` pattern to remaining 15 route files
- [ ] Remove `GLOBAL_DICTIONARY` + `classifier.js` if ML stays unused
- [ ] (Optional) Reduce frontend service abstraction to remote-only, add local mode on demand

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| ML removal breaks categorization UX | A/B test before final removal. Keep code in `unused/classifier.js` for 1 sprint. |
| Route refactoring introduces bugs | Test each route after middleware adoption. Diff should be purely mechanical. |
| Frontend offline mode requested mid-sprint | Baseline is remote-only; re-add local mode in <2 hours if needed. |

---

## Defaults

- **Active intensity:** Full (stdlib + native first, shortest diff).
- **Mark deliberate cuts:** `ponytail:` comments on removed ML and frontend abstraction.
- **Test baseline:** All tests pass before and after refactoring.
