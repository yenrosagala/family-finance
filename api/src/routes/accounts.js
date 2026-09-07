import { Router } from 'express';
import pool from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

async function requireHousehold(client, userId) {
  const { rows } = await client.query(
    `select household_id from household_members where user_id = $1 limit 1`,
    [userId]
  );
  if (!rows[0]) {
    const e = new Error('You are not in a household yet');
    e.status = 403;
    throw e;
  }
  return rows[0].household_id;
}

// GET /api/accounts
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const { rows } = await client.query(
      `select * from accounts where household_id = $1 and is_active = true order by name`,
      [householdId]
    );
    return res.json({ accounts: rows.map((a) => ({ ...a, balance: Number(a.balance) })) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /api/accounts
router.post('/', authRequired, async (req, res) => {
  const { name, type, openingBalance } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);

    await client.query('begin');
    const { rows } = await client.query(
      `insert into accounts (household_id, name, type, currency)
       values ($1, $2, $3, $4) returning *`,
      [householdId, String(name).trim(), type, req.body.currency || 'IDR']
    );
    const account = rows[0];

    // Optional opening balance: represented as an income transaction so the
    // balance-sync trigger sets accounts.balance (never a direct balance write).
    let openingTransaction = null;
    const ob = Number(openingBalance);
    if (ob && ob > 0) {
      // Ensure a household-scoped "Opening Balance" income category exists.
      let cat = await client.query(
        `select id from categories
         where household_id = $1 and lower(name) = 'opening balance' and transaction_type = 'income' limit 1`,
        [householdId]
      ).then((r) => r.rows[0] || null);
      if (!cat) {
        cat = await client.query(
          `insert into categories (household_id, name, transaction_type, is_default)
           values ($1, 'Opening Balance', 'income', false) returning id`,
          [householdId]
        ).then((r) => r.rows[0]);
      }
      const ins = await client.query(
        `insert into transactions
           (household_id, type, amount, txn_date, note, added_by, category_id, to_account_id)
         values ($1, 'income', $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          householdId, ob, new Date().toISOString().slice(0, 10),
          `Account opening balance for ${String(name).trim()}`, req.user.id,
          cat.id, account.id,
        ]
      );
      openingTransaction = ins.rows[0];
    }

    // Re-fetch the account so the returned balance reflects any opening transaction.
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
router.delete('/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { household_id } = await client.query(
      `select household_id from accounts where id = $1`,
      [req.params.id]
    ).then((r) => r.rows[0] || {});
    if (!household_id) return res.status(404).json({ error: 'Account not found' });
    // soft-deactivate
    await client.query(`update accounts set is_active = false where id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
