import { Router } from 'express';

const router = Router();
// pool → req.householdDb, requireHousehold → req.householdId (set by tenantMiddleware)

// GET /api/accounts
router.get('/', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    const { rows } = await client.query(
      `select * from accounts where household_id = $1 and is_active = true order by name`,
      [req.householdId]
    );
    return res.json({ accounts: rows.map((a) => ({ ...a, balance: Number(a.balance) })) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/accounts
router.post('/', async (req, res) => {
  const { name, type, openingBalance } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const client = await req.householdDb.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into accounts (household_id, name, type, currency)
       values ($1, $2, $3, $4) returning *`,
      [req.householdId, String(name).trim(), type, req.body.currency || 'IDR']
    );
    const account = rows[0];

    let openingTransaction = null;
    const ob = Number(openingBalance);
    if (ob && ob > 0) {
      let cat = await client.query(
        `select id from categories
         where household_id = $1 and lower(name) = 'opening balance' and transaction_type = 'income' limit 1`,
        [req.householdId]
      ).then((r) => r.rows[0] || null);
      if (!cat) {
        cat = await client.query(
          `insert into categories (household_id, name, transaction_type, is_default)
           values ($1, 'Opening Balance', 'income', false) returning id`,
          [req.householdId]
        ).then((r) => r.rows[0]);
      }
      const ins = await client.query(
        `insert into transactions
           (household_id, type, amount, txn_date, note, added_by, category_id, to_account_id)
         values ($1, 'income', $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          req.householdId, ob, new Date().toISOString().slice(0, 10),
          `Account opening balance for ${String(name).trim()}`, req.user.id,
          cat.id, account.id,
        ]
      );
      openingTransaction = ins.rows[0];
    }

    const refreshed = await client.query(
      `select * from accounts where id = $1`,
      [account.id]
    ).then((r) => r.rows[0]);

    await client.query('commit');
    return res.status(201).json({ account: refreshed, opening_transaction: openingTransaction });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  const client = await req.householdDb.connect();
  try {
    // Fix: verify the account belongs to THIS household before deleting
    const { rows } = await client.query(
      `select id from accounts where id = $1 and household_id = $2`,
      [req.params.id, req.householdId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    await client.query(`update accounts set is_active = false where id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
