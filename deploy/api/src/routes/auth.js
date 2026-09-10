import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { signToken, authRequired } from '../auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  const normalized = String(email).toLowerCase().trim();
  const hash = bcrypt.hashSync(password, 10);

  try {
    const { rows } = await pool.query(
      `insert into app_users (email, password_hash, display_name)
       values ($1, $2, $3)
       returning id, email, display_name, created_at`,
      [normalized, hash, displayName || normalized.split('@')[0]]
    );
    const user = rows[0];
    return res.status(201).json({ token: signToken(user.id), user });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalized = String(email).toLowerCase().trim();

  try {
    const { rows } = await pool.query(
      `select id, email, password_hash, display_name from app_users where email = $1`,
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

// GET /api/auth/me
router.get('/me', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select id, email, display_name, created_at from app_users where id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } finally {
    client.release();
  }
});

export default router;
