import { Router } from 'express';

const router = Router();

// GET /api/categories?type=income|expense
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const type = req.query.type;
    let q = `select * from categories where household_id = $1`;
    const params = [req.householdId];
    if (type) { params.push(type); q += ` and transaction_type = $${params.length}`; }
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
router.post('/', async (req, res) => {
  const { name, transaction_type, icon, color } = req.body || {};
  if (!name || !transaction_type)
    return res.status(400).json({ error: 'name and transaction_type are required' });
  const client = await req.householdDb.connect();
  try {
    const result = await client.query(
      `insert into categories (household_id, name, icon, color, transaction_type)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.householdId, String(name).trim(), icon || null, color || null, transaction_type]
    );
    return res.status(201).json({ category: result.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
