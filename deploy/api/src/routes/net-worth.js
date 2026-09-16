import { Router } from 'express';
import { authRequired } from '../auth.js';
import { withHousehold } from '../middleware.js';

const router = Router();

router.get('/', authRequired, withHousehold(async (req, res, client, householdId) => {
  const [accounts, investments, assets, liabilities] = await Promise.all([
    client.query(`select coalesce(sum(coalesce(balance,0)),0)::float as total from accounts where household_id = $1`, [householdId]),
    client.query(`select coalesce(sum(coalesce(current_value,0)),0)::float as total from investments where household_id = $1`, [householdId]),
    client.query(`select coalesce(sum(coalesce(current_value,0)),0)::float as total from assets where household_id = $1`, [householdId]),
    client.query(`select coalesce(sum(coalesce(current_balance,0)),0)::float as total from liabilities where household_id = $1`, [householdId]),
  ]);
  const accountsTotal = Number(accounts.rows[0].total || 0);
  const investmentsTotal = Number(investments.rows[0].total || 0);
  const assetsTotal = Number(assets.rows[0].total || 0);
  const liabilitiesTotal = Number(liabilities.rows[0].total || 0);
  const totalAssets = accountsTotal + investmentsTotal + assetsTotal;
  let snapshots = [];
  try {
    const { rows } = await client.query(`select month, total_assets, total_liabilities, net_worth::float as net_worth from net_worth_snapshots where household_id = $1 order by month`, [householdId]);
    snapshots = rows.map((r) => ({ month: r.month, total_assets: Number(r.total_assets), total_liabilities: Number(r.total_liabilities), net_worth: Number(r.net_worth) }));
  } catch (_e) {}
  res.json({ current: { accounts: accountsTotal, investments: investmentsTotal, assets: assetsTotal, total_assets: totalAssets, liabilities: liabilitiesTotal, net_worth: totalAssets - liabilitiesTotal }, history: snapshots });
}));

export default router;
