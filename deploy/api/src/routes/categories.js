import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

// GET /api/categories?type=income|expense
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select household_id from household_members where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not in a household yet' });
    const householdId = rows[0].household_id;

    const type = req.query.type;
    let q = `select * from categories where household_id = $1`;
    const params = [householdId];
    if (type) {
      params.push(type);
      q += ` and transaction_type = $${params.length}`;
    }
    q += ` order by name`;
    const { rows: cats } = await client.query(q, params);
    return res.json({ categories: cats });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/categories
router.post('/', authRequired, async (req, res) => {
  const { name, transaction_type, icon, color } = req.body || {};
  if (!name || !transaction_type) {
    return res.status(400).json({ error: 'name and transaction_type are required' });
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select household_id from household_members where user_id = $1 limit 1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not in a household yet' });
    const householdId = rows[0].household_id;

    const result = await client.query(
      `insert into categories (household_id, name, icon, color, transaction_type)
       values ($1, $2, $3, $4, $5) returning *`,
      [householdId, String(name).trim(), icon || null, color || null, transaction_type]
    );
    return res.status(201).json({ category: result.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
