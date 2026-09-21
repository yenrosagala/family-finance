import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth.js';
import { masterDb, getHouseholdPool } from '../db.js';

// ─── tenantMiddleware ────────────────────────────────────────────────────────
//
// Drop-in replacement for authRequired on all routes that need household data.
//
// What it does:
//   1. Verifies the JWT (same as authRequired).
//   2. Looks up the user's household in the master DB.
//   3. Attaches req.householdDb  — a Pool connected to that household's schema.
//   4. Attaches req.householdId  — the household UUID (used in queries).
//   5. Attaches req.user         — { id, role } (same shape as authRequired).
//
// Routes swap:
//   pool.connect()  →  req.householdDb.connect()
//   (no other query changes needed — household_id scoping stays as-is)

export async function tenantMiddleware(req, res, next) {
  // 1. Verify JWT
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = payload.sub;

  // 2. Look up user + household DB URL from master registry
  let row;
  try {
    const { rows } = await masterDb.query(
      `SELECT
         u.id,
         u.role,
         h.id          AS household_id,
         h.schema_name AS household_schema,
         h.db_url      AS household_db_url
       FROM app_users u
       JOIN households_registry h ON h.id = u.household_id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );
    row = rows[0];
  } catch (e) {
    console.error('[tenantMiddleware] master DB query failed:', e.message);
    return res.status(500).json({ error: 'Internal error resolving household' });
  }

  if (!row) {
    // User exists but has no household yet (just registered, not yet created/joined).
    return res.status(403).json({
      error: 'You are not assigned to a household yet',
      code: 'NO_HOUSEHOLD',
    });
  }

  // 3. Attach household DB pool (reused from cache — not a new pool per request)
  req.user        = { id: userId, role: row.role };
  req.householdId = row.household_id;
  req.householdDb = getHouseholdPool(row.household_db_url, row.household_schema);
  req.householdSchema = row.household_schema || null;

  return next();
}

// ─── requireHousehold helper ─────────────────────────────────────────────────
// Shared utility used by routes that still call pool.connect() manually.
// Replaces the copy-pasted requireHousehold() in every route file.
// Usage: const householdId = await requireHousehold(req);

export async function requireHousehold(req) {
  if (!req.householdId) {
    const err = new Error('You are not in a household yet');
    err.status = 403;
    throw err;
  }
  return req.householdId;
}
