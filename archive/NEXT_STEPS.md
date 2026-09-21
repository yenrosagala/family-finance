# Next Steps: Apply Middleware Pattern to Remaining Routes

## Overview
The middleware pattern has been applied to **1 route file** (`accounts.js`) as a template.
**15 more route files** follow the same pattern and can be refactored using the same approach.

Each refactoring saves ~30-50 lines of boilerplate per file and removes the `requireHousehold` duplicate.

---

## Files to Update (in order of size/priority)

### High Priority (Largest Payoff)

1. **`api/src/routes/transactions.js`**
   - Lines: ~150
   - Pattern: Multiple endpoints with household checks
   - **Template:** Use `accounts.js` as reference
   - **Effort:** 30 min

2. **`api/src/routes/categories.js`**
   - Lines: ~80
   - Pattern: Standard CRUD with household resolution
   - **Effort:** 20 min

3. **`api/src/routes/budgets.js`**
   - Lines: ~100
   - Pattern: Read + write with transaction handling
   - **Effort:** 25 min

### Medium Priority

4. **`api/src/routes/investments.js`** (~80 lines)
5. **`api/src/routes/assets.js`** (~70 lines)
6. **`api/src/routes/liabilities.js`** (~70 lines)
7. **`api/src/routes/saving-goals.js`** (~60 lines)

### Lower Priority (Smaller Files)

8. **`api/src/routes/household.js`** (~50 lines)
9. **`api/src/routes/dictionary.js`** (~40 lines)
10. **`api/src/routes/categorize.js`** (~30 lines)
11. **`api/src/routes/receipt.js`** (~80 lines, complex logic)
12. **`api/src/routes/net-worth.js`** (~40 lines)
13. **`api/src/routes/reports.js`** (~50 lines)
14. **`api/src/routes/auth.js`** (~60 lines, no household checks needed)

---

## Refactoring Checklist Per File

For each route file:

- [ ] 1. Import middleware: `import { withHousehold, withTransaction } from '../middleware.js';`
- [ ] 2. Remove local `requireHousehold` function (usually lines 5-15)
- [ ] 3. Replace all `const client = await pool.connect()` + `try/finally/catch` blocks with `withHousehold()` or `withTransaction()`
- [ ] 4. Remove explicit `client.release()` calls (middleware handles it)
- [ ] 5. Simplify error responses: `throw new Error(msg)` instead of manual `res.status().json()`
- [ ] 6. Delete `import pool from '../db.js'` if no longer used
- [ ] 7. Run tests for that route

---

## Pattern Examples

### GET endpoint (simple read)
```javascript
// BEFORE
router.get('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query('SELECT * FROM budgets WHERE id = $1 AND household_id = $2', [req.params.id, householdId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json({ budget: rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// AFTER
router.get('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query('SELECT * FROM budgets WHERE id = $1 AND household_id = $2', [req.params.id, householdId]);
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  res.json({ budget: rows[0] });
}));
```

### POST endpoint (write with transaction)
```javascript
// BEFORE
router.post('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO budgets (...) RETURNING *', [...]);
    await client.query('COMMIT');
    return res.status(201).json({ budget: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// AFTER
router.post('/', authRequired, withTransaction(async (req, res, client) => {
  // withTransaction() already calls BEGIN, COMMIT on success, ROLLBACK on error
  const { rows: [{ household_id: householdId }] } = await client.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1',
    [req.user.id]
  );
  const { rows } = await client.query('INSERT INTO budgets (...) RETURNING *', [...]);
  res.status(201).json({ budget: rows[0] });
}));
```

### DELETE endpoint (idempotent removal)
```javascript
// BEFORE
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    await client.query('DELETE FROM budgets WHERE id = $1 AND household_id = $2', [req.params.id, householdId]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// AFTER
router.delete('/:id', authRequired, withHousehold(async (req, res, client, householdId) => {
  await client.query('DELETE FROM budgets WHERE id = $1 AND household_id = $2', [req.params.id, householdId]);
  res.json({ ok: true });
}));
```

---

## Special Cases

### `auth.js` (No household checks)
This file doesn't need middleware changes since it handles signup/login (before household exists).
**Action:** Leave as-is.

### `receipt.js` (Complex logic)
Contains image parsing + ML integration. Refactor in smaller chunks:
1. First: Extract middleware pattern for route wrappers
2. Later: Address ML categorization separately

### `reports.js` (Read-heavy)
Mostly GET endpoints with complex queries.
**Action:** Apply `withHousehold` to all endpoints.

---

## Validation Checklist

After refactoring each file:

- [ ] Route still passes existing tests
- [ ] Error responses match original format (`{ error: "message" }`)
- [ ] Pool connections are released (check for connection leaks)
- [ ] Household ID is correctly resolved and passed to queries
- [ ] HTTP status codes unchanged (200, 201, 400, 404, 500, etc.)

---

## Estimated Impact

- **Total lines removed:** ~550 (30-50 per file × 15 files)
- **Bugs reduced:** Fewer variations of error handling = fewer edge cases
- **Time saved per file:** 15-30 min per file = ~5 hours total for 15 files
- **When to do it:** Spread across 2-3 sprints to avoid merge conflicts

---

## Notes

- `middleware.js` is already in place; no new dependencies added
- All changes are **purely mechanical** — no logic changes
- Tests should pass unchanged; only whitespace/import diffs
- If a route file has custom error handling, preserve it by wrapping in a function

**Once all 15 files are done:** You can delete the 16 copies of `requireHousehold` and simplify all route patterns site-wide.
