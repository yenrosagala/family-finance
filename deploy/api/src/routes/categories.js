import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const type = req.query.type;
  let q = `select * from categories where household_id = $1`;
  const params = [householdId];
  if (type) {
    params.push(type);
    q += ` and transaction_type = $${params.length}`;
  }
  q += ` order by name`;
  const { rows: cats } = await client.query(q, params);
  res.json({ categories: cats });
}));

router.post('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { name, transaction_type, icon, color } = req.body || {};
  if (!name || !transaction_type) throw Object.assign(new Error('name and transaction_type are required'), { status: 400 });
  const result = await client.query(
    `insert into categories (household_id, name, icon, color, transaction_type) values ($1, $2, $3, $4, $5) returning *`,
    [householdId, String(name).trim(), icon || null, color || null, transaction_type]
  );
  res.status(201).json({ category: result.rows[0] });
}));

export default router;
