import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { masterDb, getHouseholdPool } from '../db.js';
import { signToken, authRequired } from '../auth.js';
import { provisionHouseholdSchema } from '../services/provision.js';

const router = Router();

// ─── POST /api/auth/register ─────────────────────────────────────────────────
// Admin path — creates a user AND a new household with its own schema.
// Body: { email, password, displayName, householdName }

router.post('/register', async (req, res) => {
  const { email, password, displayName, householdName } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  if (!householdName || !String(householdName).trim()) {
    return res.status(400).json({ error: 'householdName is required' });
  }

  const normalized = String(email).toLowerCase().trim();
  const hash = bcrypt.hashSync(password, 10);

  const masterClient = await masterDb.connect();
  try {
    await masterClient.query('BEGIN');

    // 1. Create user in master DB (no household yet)
    let user;
    try {
      const { rows } = await masterClient.query(
        `INSERT INTO app_users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, 'admin')
         RETURNING id, email, display_name`,
        [normalized, hash, displayName || normalized.split('@')[0]]
      );
      user = rows[0];
    } catch (e) {
      if (e.code === '23505') {
        await masterClient.query('ROLLBACK');
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      throw e;
    }

    // 2. Provision schema + seed tables for the new household
    //    (runs schema.sql inside a fresh Postgres schema)
    const { householdId, inviteCode, schemaName } = await provisionHouseholdSchema({
      householdName: String(householdName).trim(),
      adminEmail: normalized,
    });

    // 3. Link user → household in master DB
    await masterClient.query(
      `UPDATE app_users
       SET household_id = $1, role = 'admin'
       WHERE id = $2`,
      [householdId, user.id]
    );

    // 4. Also insert the admin as a member in the household's own schema
    //    so household_members queries still work inside that schema.
    //    We do this by connecting to the household schema directly.
    const { rows: hRows } = await masterDb.query(
      `SELECT db_url, schema_name FROM households_registry WHERE id = $1`,
      [householdId]
    );
    const householdPool = getHouseholdPool(hRows[0].db_url, hRows[0].schema_name);
    await householdPool.query(
      `INSERT INTO app_users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, normalized, displayName || normalized.split('@')[0], hash]
    );
    await householdPool.query(
      `INSERT INTO households (id, name, invite_code, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [householdId, String(householdName).trim(), inviteCode, user.id]
    );
    await householdPool.query(
      `INSERT INTO household_members (household_id, user_id, display_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT DO NOTHING`,
      [householdId, user.id, displayName || normalized.split('@')[0]]
    );

    await masterClient.query('COMMIT');

    return res.status(201).json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, display_name: user.display_name },
      household: { id: householdId, name: householdName, inviteCode },
    });
  } catch (e) {
    await masterClient.query('ROLLBACK').catch(() => {});
    console.error('[register]', e);
    return res.status(500).json({ error: e.message });
  } finally {
    masterClient.release();
  }
});

// ─── POST /api/auth/join ──────────────────────────────────────────────────────
// Member path — creates a user and joins an EXISTING household via invite code.
// No DB provisioning — the household schema already exists.
// Body: { email, password, displayName, inviteCode }

router.post('/join', async (req, res) => {
  const { email, password, displayName, inviteCode } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (!inviteCode) {
    return res.status(400).json({ error: 'inviteCode is required' });
  }

  const normalized = String(email).toLowerCase().trim();
  const hash = bcrypt.hashSync(password, 10);

  // 1. Look up household by invite code
  const { rows: hRows } = await masterDb.query(
    `SELECT id, household_name, db_url, schema_name FROM households_registry
     WHERE invite_code = upper($1)`,
    [String(inviteCode).trim()]
  );
  if (!hRows[0]) {
    return res.status(404).json({ error: 'Invalid invite code' });
  }
  const household = hRows[0];

  const masterClient = await masterDb.connect();
  try {
    await masterClient.query('BEGIN');

    // 2. Create user in master DB, linked to this household
    let user;
    try {
      const { rows } = await masterClient.query(
        `INSERT INTO app_users (email, password_hash, display_name, household_id, role)
         VALUES ($1, $2, $3, $4, 'member')
         RETURNING id, email, display_name`,
        [normalized, hash, displayName || normalized.split('@')[0], household.id]
      );
      user = rows[0];
    } catch (e) {
      if (e.code === '23505') {
        await masterClient.query('ROLLBACK');
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      throw e;
    }

    // 3. Insert member into the household's own schema
    const householdPool = getHouseholdPool(household.db_url, household.schema_name);

    await householdPool.query(
      `INSERT INTO app_users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, normalized, displayName || normalized.split('@')[0], hash]
    );
    await householdPool.query(
      `INSERT INTO household_members (household_id, user_id, display_name, role)
       VALUES ($1, $2, $3, 'member')
       ON CONFLICT (household_id, user_id) DO NOTHING`,
      [household.id, user.id, displayName || normalized.split('@')[0]]
    );

    await masterClient.query('COMMIT');

    return res.status(201).json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, display_name: user.display_name },
      household: { id: household.id, name: household.household_name },
    });
  } catch (e) {
    await masterClient.query('ROLLBACK').catch(() => {});
    console.error('[join]', e);
    return res.status(500).json({ error: e.message });
  } finally {
    masterClient.release();
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Same for both admins and members — checks master DB credentials.

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalized = String(email).toLowerCase().trim();

  try {
    const { rows } = await masterDb.query(
      `SELECT id, email, password_hash, display_name
       FROM app_users WHERE email = $1`,
      [normalized]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    return res.json({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, display_name: user.display_name },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authRequired, async (req, res) => {
  try {
    const { rows } = await masterDb.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.created_at,
              h.id AS household_id, h.household_name, h.invite_code
       FROM app_users u
       LEFT JOIN households_registry h ON h.id = u.household_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
