import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { signToken, authRequired } from '../auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (!email || !password) throw Object.assign(new Error('email and password are required'), { status: 400 });
    if (password.length < 6) throw Object.assign(new Error('password must be at least 6 characters'), { status: 400 });
    const normalized = String(email).toLowerCase().trim();
    const hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(`insert into app_users (email, password_hash, display_name) values ($1, $2, $3) returning id, email, display_name, created_at`, [normalized, hash, displayName || normalized.split('@')[0]]);
    const user = rows[0];
    res.status(201).json({ token: signToken(user.id), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw Object.assign(new Error('email and password are required'), { status: 400 });
    const normalized = String(email).toLowerCase().trim();
    const { rows } = await pool.query(`select id, email, password_hash, display_name from app_users where email = $1`, [normalized]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw Object.assign(new Error('Invalid email or password'), { status: 401 });
    res.json({ token: signToken(user.id), user: { id: user.id, email: user.email, display_name: user.display_name } });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`select id, email, display_name, created_at from app_users where id = $1`, [req.user.id]);
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
