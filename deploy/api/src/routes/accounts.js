import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold, withTransaction } from '../middleware.js';
import pool from '../db.js';

const router = Router();

// GET /api/accounts
router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const { rows } = await client.query(
    `select * from accounts where household_id = $1 and is_active = true order by name`,
    [householdId]
  );
  res.json({ accounts: rows.map((a) => ({ ...a, balance: Number(a.balance) })) });
}));

// POST /api/accounts
router.post('/', authRequired, withTransaction(async (req, res, client) => {
  const { name, type, openingBalance } = req.body || {};
  if (!name || !type) throw Object.assign(new Error('name and type required'), { status: 400 });

  const { rows: [{ household_id: householdId }] } = await client.query(
    'select household_id from household_members where user_id = $1 limit 1',
    [req.user.id]
  );

  const { rows: [account] } = await client.query(
    `insert into accounts (household_id, name, type, currency) values ($1, $2, $3, $4) returning *`,
    [householdId, String(name).trim(), type, req.body.currency || 'IDR']
  );

  let openingTransaction = null;
  const ob = Number(openingBalance);
  if (ob > 0) {
    let { rows: [cat] } = await client.query(
      `select id from categories where household_id = $1 and lower(name) = 'opening balance' limit 1`,
      [householdId]
    );
    if (!cat) {
      ({ rows: [cat] } = await client.query(
        `insert into categories (household_id, name, transaction_type, is_default) values ($1, 'Opening Balance', 'income', false) returning id`,
        [householdId]
      ));
    }
    const { rows: [txn] } = await client.query(
      `insert into transactions (household_id, type, amount, txn_date, note, added_by, category_id, to_account_id)
       values ($1, 'income', $2, $3, $4, $5, $6, $7) returning *`,
      [householdId, ob, new Date().toISOString().slice(0, 10), `Opening balance for ${name}`, req.user.id, cat.id, account.id]
    );
    openingTransaction = txn;
  }

  const { rows: [refreshed] } = await client.query('select * from accounts where id = $1', [account.id]);
  res.status(201).json({ account: refreshed, opening_transaction: openingTransaction });
}));

// DELETE /api/accounts/:id
router.delete('/:id', authRequired, withHousehold(async (req, res, client) => {
  const { rows } = await client.query(`select household_id from accounts where id = $1`, [req.params.id]);
  if (!rows[0]) throw Object.assign(new Error('Account not found'), { status: 404 });
  await client.query(`update accounts set is_active = false where id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

export default router;
