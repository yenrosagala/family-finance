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

// GET /api/net-worth
// Live net worth = accounts.balance + investments.current_value + assets.current_value
//              - liabilities.current_balance.
// Also returns snapshot history (written by the scheduled job) for the trend chart.
router.get('/', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const householdId = await requireHousehold(client, req.user.id);

    const [accounts, investments, assets, liabilities, history] = await Promise.all([
      client.query(
        `select coalesce(sum(coalesce(balance,0)),0)::float as total from accounts where household_id = $1 and is_active = true`,
        [householdId]
      ),
      client.query(
        `select coalesce(sum(coalesce(current_value,0)),0)::float as total from investments where household_id = $1`,
        [householdId]
      ),
      client.query(
        `select coalesce(sum(coalesce(current_value,0)),0)::float as total from assets where household_id = $1`,
        [householdId]
      ),
      client.query(
        `select coalesce(sum(coalesce(current_balance,0)),0)::float as total from liabilities where household_id = $1`,
        [householdId]
      ),
    ]);

    const accountsTotal = Number(accounts.rows[0].total || 0);
    const investmentsTotal = Number(investments.rows[0].total || 0);
    const assetsTotal = Number(assets.rows[0].total || 0);
    const liabilitiesTotal = Number(liabilities.rows[0].total || 0);
    const totalAssets = accountsTotal + investmentsTotal + assetsTotal;
    const netWorth = totalAssets - liabilitiesTotal;

    let snapshots = [];
    try {
      const { rows } = await client.query(
        `select month, total_assets, total_liabilities, net_worth::float as net_worth
         from net_worth_snapshots
         where household_id = $1
         order by month`,
        [householdId]
      );
      snapshots = rows.map((r) => ({
        month: r.month,
        total_assets: Number(r.total_assets),
        total_liabilities: Number(r.total_liabilities),
        net_worth: Number(r.net_worth),
      }));
    } catch (_e) {
      // snapshots table may not exist in some setups; history is best-effort
    }

    return res.json({
      current: {
        accounts: accountsTotal,
        investments: investmentsTotal,
        assets: assetsTotal,
        total_assets: totalAssets,
        liabilities: liabilitiesTotal,
        net_worth: netWorth,
      },
      history: snapshots,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
