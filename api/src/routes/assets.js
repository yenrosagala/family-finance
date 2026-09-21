import { Router } from 'express';

const router = Router();
const TYPES = ['property', 'vehicle', 'other'];

router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select * from assets where household_id = $1 order by name`, [req.householdId]
    );
    return res.json({ assets: rows.map((a) => ({ ...a, current_value: Number(a.current_value || 0) })) });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.post('/', async (req, res) => {
  const { name, type, current_value } = req.body || {};
  if (!name || !name.trim() || !type || !TYPES.includes(type))
    return res.status(400).json({ error: 'name and a valid type are required' });
  const client = await req.householdDb.connect();
  try {
    const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : 0;
    const { rows } = await client.query(
      `insert into assets (household_id, name, type, current_value, last_updated)
       values ($1, $2, $3, $4, $5) returning *`,
      [req.householdId, String(name).trim(), type, value, new Date()]
    );
    return res.status(201).json({ asset: rows[0] });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.put('/:id', async (req, res) => {
  const { name, type, current_value } = req.body || {};
  const client = await req.householdDb.connect();
  try {
    const existing = await client.query(
      `select id from assets where id = $1 and household_id = $2`, [req.params.id, req.householdId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Asset not found' });
    if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'Invalid asset type' });
    const value = current_value != null && Number(current_value) >= 0 ? Number(current_value) : null;
    const { rows } = await client.query(
      `update assets set name = coalesce($1, name), type = coalesce($2, type),
           current_value = coalesce($3, current_value),
           last_updated = case when $4 then now() else last_updated end
       where id = $5 returning *`,
      [name && String(name).trim() ? String(name).trim() : null,
       type || null, value !== null ? Number(value) : null, value !== null, req.params.id]
    );
    return res.json({ asset: rows[0] });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

router.delete('/:id', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const result = await client.query(
      `delete from assets where id = $1 and household_id = $2`, [req.params.id, req.householdId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Asset not found' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); } finally { client.release(); }
});

export default router;
