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

async function monthSummary(client, householdId, month) {
  const { rows } = await client.query(
    `select
       coalesce(sum(amount) filter (where type='income'), 0)::float as income,
       coalesce(sum(amount) filter (where type='expense'), 0)::float as expense,
       coalesce(sum(amount) filter (where type='saving'), 0)::float as saved,
       coalesce(sum(amount) filter (where type='investment'), 0)::float as invested
     from transactions
     where household_id = $1 and to_char(txn_date, 'YYYY-MM') = $2`,
    [householdId, month]
  );
  const r = rows[0];
  const income = Number(r.income || 0);
  const expense = Number(r.expense || 0);
  return {
    month,
    income,
    expense,
    saved: Number(r.saved || 0),
    invested: Number(r.invested || 0),
    net_cashflow: income - expense,
  };
}

// GET /api/reports/pl?year=2026&month=9 — Income Statement (P&L) for a month
router.get('/pl', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    const [incomeRows, expenseRows] = await Promise.all([
      client.query(
        `select c.name, c.color, c.icon, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'income' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name, c.color, c.icon order by amount desc`,
        [householdId, monthKey]
      ),
      client.query(
        `select c.name, c.color, c.icon, coalesce(sum(t.amount),0)::float as amount
         from transactions t join categories c on c.id = t.category_id
         where t.household_id = $1 and t.type = 'expense' and t.category_id is not null
           and to_char(t.txn_date, 'YYYY-MM') = $2
         group by c.name, c.color, c.icon order by amount desc`,
        [householdId, monthKey]
      ),
    ]);

    const summary = await monthSummary(client, householdId, monthKey);
    return res.json({
      month: monthKey,
      income: { items: incomeRows.rows, total: summary.income },
      expense: { items: expenseRows.rows, total: summary.expense },
      net_cashflow: summary.net_cashflow,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/reports/balance-sheet — point-in-time statement of assets & liabilities
router.get('/balance-sheet', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);

    const [accounts, investments, assets, liabilities] = await Promise.all([
      client.query(
        `select id, name, balance::float as balance from accounts where household_id = $1 order by name`,
        [householdId]
      ),
      client.query(
        `select id, name, current_value::float as value from investments where household_id = $1 order by name`,
        [householdId]
      ),
      client.query(
        `select id, name, type, current_value::float as value from assets where household_id = $1 order by name`,
        [householdId]
      ),
      client.query(
        `select id, name, type, current_balance::float as balance from liabilities where household_id = $1 order by name`,
        [householdId]
      ),
    ]);

    const accountsTotal = accounts.rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    const invTotal = investments.rows.reduce((s, r) => s + Number(r.value || 0), 0);
    const assetsTotal = accountsTotal + invTotal + assets.rows.reduce((s, r) => s + Number(r.value || 0), 0);
    const liabTotal = liabilities.rows.reduce((s, r) => s + Number(r.balance || 0), 0);

    return res.json({
      accounts: accounts.rows,
      investments: investments.rows,
      assets: assets.rows,
      liabilities: liabilities.rows,
      totals: {
        accounts: accountsTotal,
        investments: invTotal,
        real_assets: assets.rows.reduce((s, r) => s + Number(r.value || 0), 0),
        assets: assetsTotal,
        liabilities: liabTotal,
        net_worth: assetsTotal - liabTotal,
      },
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /api/reports/compare?year=2026&month=9 — compare given month vs previous month
router.get('/compare', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;

    const d = new Date(year, month - 1, 1);
    const current = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prevD = new Date(year, month - 2, 1);
    const previous = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

    const [cur, prev] = await Promise.all([
      monthSummary(client, householdId, current),
      monthSummary(client, householdId, previous),
    ]);

    const fields = ['income', 'expense', 'net_cashflow', 'saved', 'invested'];
    const deltas = {};
    for (const f of fields) deltas[f] = Number((cur[f] - prev[f]).toFixed(2));

    return res.json({ current, previous, current_values: cur, previous_values: prev, deltas });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
