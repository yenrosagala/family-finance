// Money-field guardrail shared by transaction create/update and receipt save.
//
// The API connects as a Postgres superuser (RLS is bypassed), so id-scoping and
// the per-type shape contract are enforced here. Without this, the balance-sync
// trigger will happily move another household's money, or a malformed row will
// silently book nowhere.

export const TXN_TYPES = [
  'income', 'expense', 'transfer', 'transfer_out', 'transfer_in', 'investment', 'saving',
];

// Per-type required account fields — mirror of ARCHITECTURE-ESSENTIALS.md
// "Transaction types & balance effect".
export const REQUIRED_ACCOUNTS = {
  income: ['to_account_id'],
  expense: ['from_account_id'],
  transfer: ['from_account_id', 'to_account_id'],
  transfer_out: ['from_account_id'],
  transfer_in: ['to_account_id'],
  investment: ['from_account_id'],
  saving: ['from_account_id', 'to_account_id'],
};

// field -> table mapping for the household-scope check (keys are fixed above;
// never derived from request input, so no SQL injection surface).
const REF_TABLES = {
  from_account_id: 'accounts',
  to_account_id: 'accounts',
  category_id: 'categories',
  investment_id: 'investments',
  saving_goal_id: 'saving_goals',
};

// Pure shape/amount checks — no DB, unit-testable.
export function validateMoneyFieldsShape(f) {
  if (!f.type) return 'type is required';
  if (!TXN_TYPES.includes(f.type)) return `unknown transaction type: ${f.type}`;
  const amount = Number(f.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'amount must be a positive number';
  for (const field of REQUIRED_ACCOUNTS[f.type]) {
    if (!f[field]) return `${field} is required for type '${f.type}'`;
  }
  return null;
}

// Full check: shape validation plus confirmation that every referenced id
// belongs to householdId. Throws (status 400) on failure.
export async function validateMoneyFields(client, householdId, f) {
  const shapeError = validateMoneyFieldsShape(f);
  if (shapeError) throw badRequest(shapeError);

  const idsByTable = {};
  for (const [field, table] of Object.entries(REF_TABLES)) {
    if (f[field]) (idsByTable[table] ||= []).push(f[field]);
  }
  for (const [table, ids] of Object.entries(idsByTable)) {
    const { rows } = await client.query(
      `select id from ${table} where household_id = $1 and id = any($2::uuid[])`,
      [householdId, ids]
    );
    const found = new Set(rows.map((r) => r.id));
    const bad = ids.filter((id) => !found.has(id));
    if (bad.length) throw badRequest(`${table} not in this household: ${bad.join(', ')}`);
  }
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  throw e;
}