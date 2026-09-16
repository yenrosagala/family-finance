import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getLocalDb } from './database';
import type { BalanceExecutor, LocalBindParams } from './localDbTypes';
import { localUnavailable } from '../../core/dataSource';
import {
  Account,
  Budget,
  Category,
  Household,
  HouseholdMember,
  Investment,
  SavingGoal,
  Transaction,
} from '../../models';
import { DEFAULT_CATEGORIES } from '../../constants/categories';

// Local (on-device SQLite) data layer. Parity contract with the Express API:
//   - Sign-up creates user + household + default categories, scoped to the device.
//   - Balance changes NEVER happen via direct writes. They mirror the Postgres
//     balance-sync trigger (apply_balance_delta) using the exact same cases.
//   - Opening balances are represented as income transactions referencing an
//     "Opening Balance" income category (same as api/src/routes/accounts.js).
//   - P&L aggregates filter type IN ('income', 'expense').

const SESSION_KEY = 'fcf_local_session';

// Built-in local demo account. Auto-created (with a populated household) when
// you sign in with these credentials and no local user exists yet.
export const LOCAL_DEMO_EMAIL = 'demo@local.family';
export const LOCAL_DEMO_PASSWORD = 'demo1234';

// ---- session -------------------------------------------------------------

async function currentSessionUserId(): Promise<string | null> {
  return AsyncStorage.getItem(SESSION_KEY);
}

async function setSessionUserId(userId: string | null): Promise<void> {
  if (userId) await AsyncStorage.setItem(SESSION_KEY, userId);
  else await AsyncStorage.removeItem(SESSION_KEY);
}

// ---- helpers -------------------------------------------------------------

async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`
  );
  return `${salt}$${digest}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const sep = stored.indexOf('$');
  if (sep < 0) return false;
  const salt = stored.slice(0, sep);
  const hash = await hashPassword(password, salt);
  return hash === stored;
}

function newId(): string {
  return Crypto.randomUUID();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

// ---- auth -----------------------------------------------------------------

export async function localSignUp(
  email: string,
  password: string,
  displayName: string
): Promise<{ id: string; email: string; display_name: string }> {
  const normalized = String(email).toLowerCase().trim();
  const db = await getLocalDb();

  const existing = await db.getFirstAsync<{ id: string }>(
    `select id from app_users where email = ?`,
    [normalized]
  );
  if (existing) throw new Error('An account with that email already exists');

  const userId = newId();
  const householdId = newId();
  const salt = newId();
  const hash = await hashPassword(password, salt);
  const display = displayName || normalized.split('@')[0];

  await db.runAsync(
    `insert into app_users (id, email, password_hash, display_name, created_at)
     values (?, ?, ?, ?, ?)`,
    [userId, normalized, hash, display, nowIso()]
  );
  await db.runAsync(
    `insert into households (id, name, invite_code, currency, created_by, created_at)
     values (?, ?, ?, 'IDR', ?, ?)`,
    [householdId, `${display} family`, newId().replace(/-/g, '').slice(0, 6).toUpperCase(), userId, nowIso()]
  );
  await db.runAsync(
    `insert into household_members (household_id, user_id, display_name, role, joined_at)
     values (?, ?, ?, 'admin', ?)`,
    [householdId, userId, display, nowIso()]
  );

  for (const type of ['income', 'expense'] as const) {
    for (const cat of DEFAULT_CATEGORIES[type]) {
      await db.runAsync(
        `insert into categories (id, household_id, name, icon, color, transaction_type, is_default, created_at)
         values (?, ?, ?, ?, ?, ?, 1, ?)`,
        [newId(), householdId, cat.name, cat.icon, cat.color, type, nowIso()]
      );
    }
  }

  await setSessionUserId(userId);
  // Every local sign-up starts with a populated 3-month dummy household so the
  // app is explorable offline immediately. Idempotent — only seeds when empty.
  await seedLocalDemoData();
  return { id: userId, email: normalized, display_name: display };
}

export async function localSignIn(
  email: string,
  password: string
): Promise<{ id: string; email: string; display_name: string }> {
  const normalized = String(email).toLowerCase().trim();
  const db = await getLocalDb();
  let row = await db.getFirstAsync<{ id: string; email: string; display_name: string; password_hash: string }>(
    `select id, email, display_name, password_hash from app_users where email = ?`,
    [normalized]
  );
  if (!row && normalized === LOCAL_DEMO_EMAIL && password === LOCAL_DEMO_PASSWORD) {
    await localSignUp(normalized, password, 'Demo');
    row = await db.getFirstAsync<{ id: string; email: string; display_name: string; password_hash: string }>(
      `select id, email, display_name, password_hash from app_users where email = ?`,
      [normalized]
    );
  }
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new Error('Invalid email or password');
  }
  await setSessionUserId(row.id);
  // Re-seed a fresh household (e.g. after a re-install) the same way sign-up does.
  const householdId = await localHouseholdId();
  const count = await db.getFirstAsync<{ n: number }>(
    `select count(*) as n from transactions where household_id = ?`,
    [householdId]
  );
  if (!count || count.n === 0) {
    await seedLocalDemoData();
  }
  return { id: row.id, email: row.email, display_name: row.display_name };
}

export async function localSignOut(): Promise<void> {
  await setSessionUserId(null);
}

export async function localGetCurrentUser(): Promise<{
  id: string;
  email: string;
  display_name: string;
} | null> {
  const userId = await currentSessionUserId();
  if (!userId) return null;
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ id: string; email: string; display_name: string }>(
    `select id, email, display_name from app_users where id = ?`,
    [userId]
  );
  return row || null;
}

// ---- household --------------------------------------------------------------

async function localHouseholdId(): Promise<string> {
  const userId = await currentSessionUserId();
  if (!userId) throw new Error('You are not signed in');
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ household_id: string }>(
    `select household_id from household_members where user_id = ? limit 1`,
    [userId]
  );
  if (!row) throw new Error('You are not in a household yet');
  return row.household_id;
}

export async function localGetUserHousehold(): Promise<Household | null> {
  const userId = await currentSessionUserId();
  if (!userId) return null;
  const db = await getLocalDb();
  const row = await db.getFirstAsync<Household>(
    `select h.* from households h
     join household_members hm on hm.household_id = h.id
     where hm.user_id = ? limit 1`,
    [userId]
  );
  return row || null;
}

export async function localCreateHousehold(name: string): Promise<Household> {
  const existing = await localGetUserHousehold();
  if (existing) return existing;
  const userId = await currentSessionUserId();
  if (!userId) throw new Error('You are not signed in');
  const db = await getLocalDb();
  const id = newId();
  await db.runAsync(
    `insert into households (id, name, invite_code, currency, created_by, created_at)
     values (?, ?, ?, 'IDR', ?, ?)`,
    [id, String(name).trim(), newId().replace(/-/g, '').slice(0, 6).toUpperCase(), userId, nowIso()]
  );
  await db.runAsync(
    `insert into household_members (household_id, user_id, display_name, role, joined_at)
     values (?, ?, ?, 'admin', ?)`,
    [id, userId, null, nowIso()]
  );
  return (await db.getFirstAsync<Household>(`select * from households where id = ?`, [id]))!;
}

export async function localJoinHousehold(): Promise<never> {
  throw localUnavailable('Joining a household');
}

export async function localGetHouseholdMembers(): Promise<HouseholdMember[]> {
  const db = await getLocalDb();
  const user = await localGetCurrentUser();
  if (!user) return [];
  const house = await localGetUserHousehold();
  if (!house) return [];
  const row = await db.getFirstAsync<HouseholdMember>(
    `select household_id, user_id, display_name, photo_url, role, joined_at, fcm_token
     from household_members where household_id = ? and user_id = ?`,
    [house.id, user.id]
  );
  return row ? [row] : [];
}

// ---- accounts ----------------------------------------------------------------

export async function localGetAccounts(): Promise<Account[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<Account>(
    `select * from accounts where household_id = ? and is_active = 1 order by name`,
    [householdId]
  );
  return rows.map((r) => ({ ...r, is_active: !!r.is_active }));
}

export async function localCreateAccount(account: {
  name: string;
  type: string;
  currency?: string;
  openingBalance?: number;
}): Promise<Account> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const id = newId();
  const name = String(account.name).trim();

  await db.runAsync(
    `insert into accounts (id, household_id, name, type, currency, is_active, created_at)
     values (?, ?, ?, ?, ?, 1, ?)`,
    [id, householdId, name, account.type, account.currency || 'IDR', nowIso()]
  );

  // Opening balance represented as an income transaction so balance integrity
  // goes through the same apply path as every other money movement.
  const ob = Number(account.openingBalance);
  if (ob && ob > 0) {
    let cat = await db.getFirstAsync<{ id: string }>(
      `select id from categories
       where household_id = ? and lower(name) = 'opening balance' and transaction_type = 'income' limit 1`,
      [householdId]
    );
    if (!cat) {
      const catId = newId();
      await db.runAsync(
        `insert into categories (id, household_id, name, transaction_type, is_default, created_at)
         values (?, ?, 'Opening Balance', 'income', 0, ?)`,
        [catId, householdId, nowIso()]
      );
      cat = { id: catId };
    }
    await localCreateTransaction({
      type: 'income',
      amount: ob,
      txn_date: today(),
      note: `Account opening balance for ${name}`,
      to_account_id: id,
      category_id: cat.id,
    });
  }

  const acct = await db.getFirstAsync<Account>(`select * from accounts where id = ?`, [id]);
  return { ...(acct as Account), is_active: !!acct?.is_active };
}

export async function localDeleteAccount(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update accounts set is_active = 0 where id = ?`, [id]);
}

// ---- categories ----------------------------------------------------------------

export async function localGetCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<Omit<Category, 'is_default'> & { is_default: number }>(
    type
      ? `select * from categories where household_id = ? and transaction_type = ? order by name`
      : `select * from categories where household_id = ? order by transaction_type, name`,
    type ? [householdId, type] : [householdId]
  );
  return rows.map((r) => ({ ...r, is_default: !!r.is_default }));
}

export async function localCreateCategory(category: {
  name: string;
  transaction_type: 'income' | 'expense';
  icon?: string;
  color?: string;
}): Promise<Category> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const id = newId();
  await db.runAsync(
    `insert into categories (id, household_id, name, icon, color, transaction_type, is_default, created_at)
     values (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, householdId, String(category.name).trim(), category.icon || null, category.color || null, category.transaction_type, nowIso()]
  );
  const row = await db.getFirstAsync<Omit<Category, 'is_default'> & { is_default: number }>(
    `select * from categories where id = ?`,
    [id]
  );
  return { ...(row as any), is_default: !!row?.is_default };
}

// ---- transactions ------------------------------------------------------------

// Balance effect mirror of apply_balance_delta (supabase/triggers.sql).
// sign = +1 to apply a row's effect, -1 to reverse it.

async function applyBalanceDelta(
  dbOrTxn: BalanceExecutor,
  fields: { type: string; amount: number; from_account_id: string | null; to_account_id: string | null },
  sign: number
): Promise<void> {
  const delta = fields.amount * sign;
  const dec = async (sql: string, id: string) => {
    if (id) await dbOrTxn.runAsync(sql, [delta, id]);
  };
  switch (fields.type) {
    case 'income':
      await dec(`update accounts set balance = balance + ? where id = ?`, fields.to_account_id || '');
      break;
    case 'expense':
      await dec(`update accounts set balance = balance - ? where id = ?`, fields.from_account_id || '');
      break;
    case 'transfer':
      await dec(`update accounts set balance = balance - ? where id = ?`, fields.from_account_id || '');
      await dec(`update accounts set balance = balance + ? where id = ?`, fields.to_account_id || '');
      break;
    case 'transfer_out':
      await dec(`update accounts set balance = balance - ? where id = ?`, fields.from_account_id || '');
      break;
    case 'transfer_in':
      await dec(`update accounts set balance = balance + ? where id = ?`, fields.to_account_id || '');
      break;
    case 'investment':
      await dec(`update accounts set balance = balance - ? where id = ?`, fields.from_account_id || '');
      break;
    case 'saving':
      await dec(`update accounts set balance = balance - ? where id = ?`, fields.from_account_id || '');
      await dec(`update accounts set balance = balance + ? where id = ?`, fields.to_account_id || '');
      break;
    default:
      throw new Error(`Unknown transaction type: ${fields.type}`);
  }
}

export async function localGetTransactions(options?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
  type?: string;
  categoryId?: string;
}): Promise<Transaction[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const params: LocalBindParams = [householdId];
  let sql = `select * from transactions where household_id = ?`;
  if (options?.startDate) {
    params.push(options.startDate);
    sql += ` and txn_date >= ?`;
  }
  if (options?.endDate) {
    params.push(options.endDate);
    sql += ` and txn_date <= ?`;
  }
  if (options?.type) {
    params.push(options.type);
    sql += ` and type = ?`;
  }
  if (options?.categoryId) {
    params.push(options.categoryId);
    sql += ` and category_id = ?`;
  }
  sql += ` order by txn_date desc, created_at desc`;
  if (options?.limit && options.limit > 0) {
    params.push(options.limit);
    sql += ` limit ?`;
  }
  return db.getAllAsync<Transaction>(sql, params);
}

export async function localCreateTransaction(
  t: Partial<Transaction> & { type: string; amount: number }
): Promise<Transaction> {
  if (!t.type || !t.amount || t.amount <= 0) {
    throw new Error('type and positive amount are required');
  }
  const householdId = await localHouseholdId();
  const userId = await currentSessionUserId();
  const db = await getLocalDb();

  const id = newId();
  const created = nowIso();
  const fields = {
    type: t.type,
    amount: Number(t.amount),
    from_account_id: t.from_account_id || null,
    to_account_id: t.to_account_id || null,
  };

  await db.withExclusiveTransactionAsync(async (txn) => {
    await applyBalanceDelta(txn, fields, 1);
    await txn.runAsync(
      `insert into transactions
        (id, household_id, type, amount, txn_date, note, added_by, created_at,
         category_id, from_account_id, to_account_id, to_person,
         investment_id, saving_goal_id, merchant_name, receipt_image_url,
         categorization_source, receipt_fingerprint)
       values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, householdId, t.type, fields.amount,
        t.txn_date || today(), t.note || null, userId, created,
        t.category_id || null, fields.from_account_id, fields.to_account_id,
        t.to_person || null, t.investment_id || null, t.saving_goal_id || null,
        t.merchant_name || null, t.receipt_image_url || null,
        t.categorization_source || 'manual', t.receipt_fingerprint || null,
      ]
    );
  });

  const row = await db.getFirstAsync<Transaction>(`select * from transactions where id = ?`, [id]);
  if (!row) throw new Error('Failed to create transaction');
  return row;
}

export async function localUpdateTransaction(
  id: string,
  patch: Partial<Transaction>
): Promise<Transaction> {
  const db = await getLocalDb();
  return db.withExclusiveTransactionAsync(async (txn) => {
    const cur = await txn.getFirstAsync<Transaction>(
      `select * from transactions where id = ?`,
      [id]
    );
    if (!cur) throw new Error('Transaction not found');

    const merged: Transaction = {
      ...cur,
      ...patch,
      id: cur.id,
      household_id: cur.household_id,
      added_by: cur.added_by,
      created_at: cur.created_at,
      type: (patch.type || cur.type) as Transaction['type'],
      amount: patch.amount != null ? Number(patch.amount) : Number(cur.amount),
      txn_date: patch.txn_date || cur.txn_date,
      note: patch.note !== undefined ? patch.note : cur.note,
      category_id: patch.category_id !== undefined ? patch.category_id : cur.category_id,
      from_account_id: patch.from_account_id !== undefined ? patch.from_account_id : cur.from_account_id,
      to_account_id: patch.to_account_id !== undefined ? patch.to_account_id : cur.to_account_id,
      to_person: patch.to_person !== undefined ? patch.to_person : cur.to_person,
      investment_id: patch.investment_id !== undefined ? patch.investment_id : cur.investment_id,
      saving_goal_id: patch.saving_goal_id !== undefined ? patch.saving_goal_id : cur.saving_goal_id,
      merchant_name: patch.merchant_name !== undefined ? patch.merchant_name : cur.merchant_name,
      receipt_image_url: patch.receipt_image_url !== undefined ? patch.receipt_image_url : cur.receipt_image_url,
      categorization_source: patch.categorization_source !== undefined
        ? patch.categorization_source
        : cur.categorization_source,
      receipt_fingerprint: patch.receipt_fingerprint !== undefined
        ? patch.receipt_fingerprint
        : cur.receipt_fingerprint,
    };

    const oldFields = {
      type: cur.type,
      amount: Number(cur.amount),
      from_account_id: cur.from_account_id,
      to_account_id: cur.to_account_id,
    };
    const newFields = {
      type: merged.type,
      amount: merged.amount,
      from_account_id: merged.from_account_id,
      to_account_id: merged.to_account_id,
    };

    await applyBalanceDelta(txn, oldFields, -1);
    await applyBalanceDelta(txn, newFields, 1);

    await txn.runAsync(
      `update transactions set
         type = ?, amount = ?, txn_date = ?, note = ?, category_id = ?,
         from_account_id = ?, to_account_id = ?, to_person = ?,
         investment_id = ?, saving_goal_id = ?, merchant_name = ?,
         receipt_image_url = ?, categorization_source = ?, receipt_fingerprint = ?
       where id = ?`,
      [
        merged.type, merged.amount, merged.txn_date, merged.note, merged.category_id,
        merged.from_account_id, merged.to_account_id, merged.to_person,
        merged.investment_id, merged.saving_goal_id, merged.merchant_name,
        merged.receipt_image_url, merged.categorization_source, merged.receipt_fingerprint,
        id,
      ]
    );

    const row = await txn.getFirstAsync<Transaction>(`select * from transactions where id = ?`, [id]);
    if (!row) throw new Error('Failed to update transaction');
    return row;
  });
}

export async function localDeleteTransaction(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<Transaction>(
      `select * from transactions where id = ?`,
      [id]
    );
    if (!row) throw new Error('Transaction not found');
    await applyBalanceDelta(
      txn,
      {
        type: row.type,
        amount: Number(row.amount),
        from_account_id: row.from_account_id,
        to_account_id: row.to_account_id,
      },
      -1
    );
    await txn.runAsync(`delete from transactions where id = ?`, [id]);
  });
}

// ---- monthly aggregates (P&L only: income/expense; saving/investment reported separately) ----

export async function localGetMonthlySummary(year: number, month: number) {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const prefix = monthPrefix(year, month);
  const row = await db.getFirstAsync<{ income: number; expense: number; saved: number; invested: number }>(
    `select
       coalesce(sum(case when type = 'income' then amount end), 0) as income,
       coalesce(sum(case when type = 'expense' then amount end), 0) as expense,
       coalesce(sum(case when type = 'saving' then amount end), 0) as saved,
       coalesce(sum(case when type = 'investment' then amount end), 0) as invested
     from transactions
     where household_id = ? and substr(txn_date, 1, 7) = ?`,
    [householdId, prefix]
  );
  return {
    income: Number(row?.income || 0),
    expense: Number(row?.expense || 0),
    net_cashflow: Number(row?.income || 0) - Number(row?.expense || 0),
    saved: Number(row?.saved || 0),
    invested: Number(row?.invested || 0),
    month: prefix,
  };
}

export async function localGetCategoryBreakdown(year: number, month: number, type: 'income' | 'expense') {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const prefix = monthPrefix(year, month);
  const rows = await db.getAllAsync<{ id: string; name: string; color: string | null; icon: string | null; total: number }>(
    `select c.id, c.name, c.color, c.icon, sum(t.amount) as total
     from transactions t
     join categories c on c.id = t.category_id
     where t.household_id = ? and t.type = ? and t.category_id is not null
       and substr(t.txn_date, 1, 7) = ?
     group by c.id, c.name, c.color, c.icon
     order by total desc`,
    [householdId, type, prefix]
  );
  return rows.map((r) => ({ ...r, total: Number(r.total || 0) }));
}

export async function localGetCategoryBreakdownRange(
  startDate: string,
  endDate: string,
  type: 'income' | 'expense'
) {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ id: string; name: string; color: string | null; icon: string | null; total: number }>(
    `select c.id, c.name, c.color, c.icon, sum(t.amount) as total
     from transactions t
     join categories c on c.id = t.category_id
     where t.household_id = ? and t.type = ? and t.category_id is not null
       and date(t.txn_date) >= ? and date(t.txn_date) <= ?
     group by c.id, c.name, c.color, c.icon
     order by total desc`,
    [householdId, type, startDate, endDate]
  );
  return rows.map((r) => ({ ...r, total: Number(r.total || 0) }));
}

// ---- time series (income vs expense buckets for the dashboard line chart) ----

export async function localGetSeries(
  bucket: 'day' | 'week' | 'month',
  startDate: string,
  endDate: string
): Promise<{ label: string; income: number; expense: number; saved: number; invested: number }[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const keyExpr =
    bucket === 'week'
      ? `date(txn_date, '-' || ((cast(strftime('%w', txn_date) as integer) + 6) % 7) || ' days')`
      : bucket === 'month'
        ? `substr(txn_date, 1, 7)`
        : `date(txn_date)`;
  const rows = await db.getAllAsync<{ label: string; income: number; expense: number; saved: number; invested: number }>(
    `select ${keyExpr} as label,
       coalesce(sum(case when type = 'income' then amount end), 0) as income,
       coalesce(sum(case when type = 'expense' then amount end), 0) as expense,
       coalesce(sum(case when type = 'saving' then amount end), 0) as saved,
       coalesce(sum(case when type = 'investment' then amount end), 0) as invested
     from transactions
     where household_id = ? and date(txn_date) >= ? and date(txn_date) <= ?
     group by ${keyExpr}
     order by ${keyExpr}`,
    [householdId, startDate, endDate]
  );
  return rows.map((r) => ({
    label: r.label,
    income: Number(r.income || 0),
    expense: Number(r.expense || 0),
    saved: Number(r.saved || 0),
    invested: Number(r.invested || 0),
  }));
}

// ---- local-only net worth (accounts + investments mark-to-market) ----

export async function localNetWorth() {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ accounts: number; investments: number }>(
    `select
       coalesce((select sum(balance) from accounts where household_id = ? and is_active = 1), 0) as accounts,
       coalesce((select sum(current_value) from investments where household_id = ?), 0) as investments`,
    [householdId, householdId]
  );
  const accounts = Number(row?.accounts || 0);
  const investments = Number(row?.investments || 0);
  const totalAssets = accounts + investments;
  return {
    current: {
      accounts,
      investments,
      assets: 0,
      total_assets: totalAssets,
      liabilities: 0,
      net_worth: totalAssets,
    },
    history: [] as { month: string; total_assets: number; total_liabilities: number; net_worth: number }[],
  };
}

// ---- budgets ------------------------------------------------------------------

export interface LocalBudget extends Budget {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  spent: number;
  remaining: number;
  over_budget: boolean;
  progress: number; // 0..1
}

type SqlRow = Record<string, unknown>;

type LocalBudgetUpdate = {
  monthly_limit: number;
  month?: string | null;
  is_recurring?: boolean | null;
  rollover?: boolean | null;
};

function toBudget(b: Record<string, unknown>): LocalBudget {
  const limit = Number(b.monthly_limit || 0);
  const spent = Number(b.spent || 0);
  return {
    id: String(b.id),
    household_id: String(b.household_id),
    category_id: String(b.category_id),
    monthly_limit: limit,
    month: b.month == null ? null : String(b.month),
    is_recurring: !!b.is_recurring,
    rollover: !!b.rollover,
    created_by: b.created_by == null ? null : String(b.created_by),
    created_at: String(b.created_at),
    category_name: b.category_name == null ? null : String(b.category_name),
    category_color: b.category_color == null ? null : String(b.category_color),
    category_icon: b.category_icon == null ? null : String(b.category_icon),
    spent,
    remaining: Math.max(0, limit - spent),
    over_budget: spent > limit,
    progress: limit > 0 ? Math.min(1, spent / limit) : 0,
  };
}

export async function localGetBudgets(month?: string): Promise<{ budgets: LocalBudget[]; month: string }> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const m = month || monthPrefix(new Date().getFullYear(), new Date().getMonth() + 1);
  const rows = await db.getAllAsync<SqlRow>(
    `select b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
       coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as spent
     from budgets b
     join categories c on c.id = b.category_id
     left join transactions t
       on t.household_id = b.household_id
      and t.category_id = b.category_id
      and t.type = 'expense'
      and substr(t.txn_date, 1, 7) = ?
     where b.household_id = ? and (b.is_recurring = 1 or b.month = ?)
     group by b.id, c.name, c.color, c.icon
     order by c.name`,
    [m, householdId, m]
  );
  return { budgets: rows.map((r) => toBudget(r)), month: m };
}

export async function localCreateBudget(input: {
  category_id: string;
  monthly_limit: number;
  month?: string | null;
  is_recurring?: boolean | null;
  rollover?: boolean | null;
}): Promise<Budget> {
  const householdId = await localHouseholdId();
  const userId = await currentSessionUserId();
  const db = await getLocalDb();
  const cat = await db.getFirstAsync<{ id: string }>(
    `select id from categories where id = ? and household_id = ?`,
    [input.category_id, householdId]
  );
  if (!cat) throw new Error('Category not found in this household');
  const id = newId();
  await db.runAsync(
    `insert into budgets (id, household_id, category_id, monthly_limit, month, is_recurring, rollover, created_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, householdId, input.category_id, Number(input.monthly_limit),
      input.month ?? null,
      input.is_recurring == null ? 1 : input.is_recurring ? 1 : 0,
      input.rollover ? 1 : 0, userId, nowIso(),
    ]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from budgets where id = ?`, [id]);
  return toBudget({ ...row, spent: 0 });
}

export async function localUpdateBudget(
  id: string,
  input: Partial<LocalBudgetUpdate>
): Promise<Budget> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const cur = await db.getFirstAsync<SqlRow>(`select * from budgets where id = ? and household_id = ?`, [id, householdId]);
  if (!cur) throw new Error('Budget not found');
  const limit = input.monthly_limit != null && Number(input.monthly_limit) > 0
    ? Number(input.monthly_limit)
    : Number(cur.monthly_limit);
  const month = input.month !== undefined ? input.month ?? null : (cur.month == null ? null : String(cur.month));
  const isRecurring = input.is_recurring != null ? (input.is_recurring ? 1 : 0) : Number(cur.is_recurring);
  const rollover = input.rollover != null ? (input.rollover ? 1 : 0) : Number(cur.rollover);
  await db.runAsync(
    `update budgets set monthly_limit = ?, month = ?, is_recurring = ?, rollover = ? where id = ?`,
    [limit, month, isRecurring, rollover, id]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from budgets where id = ?`, [id]);
  return toBudget({ ...row, spent: 0 });
}

export async function localDeleteBudget(id: string): Promise<void> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const res = await db.runAsync(`delete from budgets where id = ? and household_id = ?`, [id, householdId]);
  if ((res as { changes?: number }).changes === 0) throw new Error('Budget not found');
}

// ---- saving goals ----------------------------------------------------------------

export interface LocalSavingGoal extends SavingGoal {
  account_name: string | null;
  remaining: number;
  progress: number; // 0..1
}

function toSavingGoal(g: Record<string, unknown>): LocalSavingGoal {
  const target = Number(g.target_amount || 0);
  const current = Number(g.current_amount || 0);
  return {
    id: String(g.id),
    household_id: String(g.household_id),
    name: String(g.name),
    target_amount: target,
    current_amount: current,
    target_date: g.target_date == null ? null : String(g.target_date),
    linked_account_id: g.linked_account_id == null ? null : String(g.linked_account_id),
    created_at: String(g.created_at),
    account_name: g.account_name == null ? null : String(g.account_name),
    remaining: Math.max(0, target - current),
    progress: target > 0 ? Math.min(1, current / target) : 0,
  };
}

export async function localGetSavingGoals(): Promise<LocalSavingGoal[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<SqlRow>(
    `select g.*, a.name as account_name,
       coalesce((select sum(t.amount) from transactions t
         where t.type = 'saving' and t.saving_goal_id = g.id), 0) as current_amount
     from saving_goals g
     left join accounts a on a.id = g.linked_account_id
     where g.household_id = ?
     order by g.created_at`,
    [householdId]
  );
  return rows.map((r) => toSavingGoal(r));
}

export async function localCreateSavingGoal(input: {
  name: string;
  target_amount: number;
  target_date?: string | null;
  linked_account_id?: string | null;
}): Promise<LocalSavingGoal> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  if (!input.name || !String(input.name).trim()) throw new Error('Goal name is required');
  if (input.target_amount == null || Number(input.target_amount) <= 0) {
    throw new Error('A positive target_amount is required');
  }
  if (input.linked_account_id) {
    const acc = await db.getFirstAsync<{ id: string }>(
      `select id from accounts where id = ? and household_id = ?`,
      [input.linked_account_id, householdId]
    );
    if (!acc) throw new Error('Linked account not found in this household');
  }
  const id = newId();
  await db.runAsync(
    `insert into saving_goals (id, household_id, name, target_amount, target_date, linked_account_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [id, householdId, String(input.name).trim(), Number(input.target_amount),
     input.target_date ?? null, input.linked_account_id ?? null, nowIso()]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from saving_goals where id = ?`, [id]);
  return toSavingGoal({ ...row, current_amount: 0 });
}

export async function localUpdateSavingGoal(
  id: string,
  input: Partial<{ name: string; target_amount: number; target_date?: string | null; linked_account_id?: string | null }>
): Promise<LocalSavingGoal> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const cur = await db.getFirstAsync<SqlRow>(`select * from saving_goals where id = ? and household_id = ?`, [id, householdId]);
  if (!cur) throw new Error('Saving goal not found');
  if (input.linked_account_id) {
    const acc = await db.getFirstAsync<{ id: string }>(
      `select id from accounts where id = ? and household_id = ?`,
      [input.linked_account_id, householdId]
    );
    if (!acc) throw new Error('Linked account not found in this household');
  }
  const name = input.name && String(input.name).trim() ? String(input.name).trim() : String(cur.name);
  const target = input.target_amount != null && Number(input.target_amount) > 0
    ? Number(input.target_amount)
    : Number(cur.target_amount);
  const targetDate = input.target_date !== undefined
    ? input.target_date ?? null
    : (cur.target_date == null ? null : String(cur.target_date));
  const linkedAccount = input.linked_account_id !== undefined
    ? input.linked_account_id ?? null
    : (cur.linked_account_id == null ? null : String(cur.linked_account_id));
  await db.runAsync(
    `update saving_goals
     set name = ?, target_amount = ?, target_date = ?, linked_account_id = ?
     where id = ?`,
    [name, target, targetDate, linkedAccount, id]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from saving_goals where id = ?`, [id]);
  const current = await db.getFirstAsync<{ total: number }>(
    `select coalesce(sum(amount), 0) as total from transactions where type = 'saving' and saving_goal_id = ?`,
    [id]
  );
  return toSavingGoal({ ...row, current_amount: Number(current?.total || 0) });
}

export async function localDeleteSavingGoal(id: string): Promise<void> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const res = await db.runAsync(`delete from saving_goals where id = ? and household_id = ?`, [id, householdId]);
  if ((res as { changes?: number }).changes === 0) throw new Error('Saving goal not found');
}

// ---- investments -------------------------------------------------------------------

export interface LocalInvestment extends Investment {
  gain_loss: number;
  gain_loss_pct: number;
}

function toInvestment(i: Record<string, unknown>): LocalInvestment {
  const total = Number(i.total_invested || 0);
  const current = Number(i.current_value || 0);
  return {
    id: String(i.id),
    household_id: String(i.household_id),
    name: String(i.name),
    type: i.type as LocalInvestment['type'],
    total_invested: total,
    current_value: current,
    last_updated: i.last_updated == null ? null : String(i.last_updated),
    created_at: String(i.created_at),
    gain_loss: current - total,
    gain_loss_pct: total > 0 ? (current - total) / total : 0,
  };
}

const INVESTMENT_TYPES = ['stocks', 'mutual_fund', 'gold', 'crypto', 'property', 'other'];

export async function localGetInvestments(): Promise<LocalInvestment[]> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<SqlRow>(
    `select i.*,
       coalesce((select sum(t.amount) from transactions t
         where t.type = 'investment' and t.investment_id = i.id), 0) as total_invested
     from investments i
     where i.household_id = ?
     order by i.created_at`,
    [householdId]
  );
  return rows.map((r) => toInvestment(r));
}

export async function localCreateInvestment(input: {
  name: string;
  type: string;
  current_value?: number;
}): Promise<LocalInvestment> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  if (!input.name || !String(input.name).trim()) throw new Error('name is required');
  if (!input.type || !INVESTMENT_TYPES.includes(input.type)) {
    throw new Error('name and a valid type are required');
  }
  const id = newId();
  const created = nowIso();
  const startingValue = input.current_value != null && Number(input.current_value) >= 0 ? Number(input.current_value) : 0;
  await db.runAsync(
    `insert into investments (id, household_id, name, type, total_invested, current_value, last_updated, created_at)
     values (?, ?, ?, ?, 0, ?, ?, ?)`,
    [id, householdId, String(input.name).trim(), input.type, startingValue,
     startingValue > 0 ? created : null, created]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from investments where id = ?`, [id]);
  return toInvestment({ ...row, total_invested: 0 });
}

export async function localUpdateInvestment(
  id: string,
  input: Partial<{ name: string; type: string; current_value?: number }>
): Promise<LocalInvestment> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const cur = await db.getFirstAsync<SqlRow>(`select * from investments where id = ? and household_id = ?`, [id, householdId]);
  if (!cur) throw new Error('Investment not found');
  if (input.type && !INVESTMENT_TYPES.includes(input.type)) throw new Error('Invalid investment type');
  const name = input.name && String(input.name).trim() ? String(input.name).trim() : String(cur.name);
  const type = input.type || String(cur.type);
  const hasValue = input.current_value != null && Number(input.current_value) >= 0;
  const currentValue = hasValue ? Number(input.current_value) : Number(cur.current_value);
  const lastUpdated = hasValue ? nowIso() : (cur.last_updated == null ? null : String(cur.last_updated));
  await db.runAsync(
    `update investments set name = ?, type = ?, current_value = ?, last_updated = ? where id = ?`,
    [name, type, currentValue, lastUpdated, id]
  );
  const row = await db.getFirstAsync<SqlRow>(`select * from investments where id = ?`, [id]);
  const invested = await db.getFirstAsync<{ total: number }>(
    `select coalesce(sum(amount), 0) as total from transactions where type = 'investment' and investment_id = ?`,
    [id]
  );
  return toInvestment({ ...row, total_invested: Number(invested?.total || 0) });
}

export async function localDeleteInvestment(id: string): Promise<void> {
  const householdId = await localHouseholdId();
  const db = await getLocalDb();
  const res = await db.runAsync(`delete from investments where id = ? and household_id = ?`, [id, householdId]);
  if ((res as { changes?: number }).changes === 0) throw new Error('Investment not found');
}

// ---- local demo data ------------------------------------------------------------

// Populates a realistic 3-month household with dummy data. Runs on every local
// sign-up and on the first sign-in of an empty local household, so the app is
// explorable offline immediately (accounts, budgets, a saving goal, an
// investment, and transactions across all 7 types). Idempotent — repeated
// sign-ins never duplicate data because it only seeds a household with zero
// transactions.
export async function seedLocalDemoData(): Promise<void> {
  const db = await getLocalDb();
  const householdId = await localHouseholdId();

  const catId = async (type: 'income' | 'expense', name: string): Promise<string | null> => {
    const row = await db.getFirstAsync<{ id: string }>(
      `select id from categories where household_id = ? and transaction_type = ? and name = ? limit 1`,
      [householdId, type, name]
    );
    return row ? row.id : null;
  };

  const incomeCat = {
    salary: await catId('income', 'Salary'),
    freelance: await catId('income', 'Freelance'),
  };
  const expenseCat = {
    food: await catId('expense', 'Food & Drinks'),
    transport: await catId('expense', 'Transportation'),
    utilities: await catId('expense', 'Bills & Utilities'),
    shopping: await catId('expense', 'Shopping'),
    groceries: await catId('expense', 'Groceries'),
    entertainment: await catId('expense', 'Entertainment'),
    health: await catId('expense', 'Health'),
  };

  const dateOn = (monthOffset: number, day: number): string => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    d.setDate(day);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  // ---- accounts (opening balance recorded as income transactions) ----
  const mandiri = await localCreateAccount({ name: 'Mandiri Bank', type: 'bank', openingBalance: 8000000 });
  const bri = await localCreateAccount({ name: 'BRI Bank', type: 'bank', openingBalance: 4000000 });
  const gopay = await localCreateAccount({ name: 'GoPay', type: 'ewallet', openingBalance: 1500000 });
  const cc = await localCreateAccount({ name: 'BNI Credit Card', type: 'credit_card', openingBalance: 0 });

  // ---- budgeting, savings, and investing so those tabs are populated too ----
  const emergencyGoal = await localCreateSavingGoal({
    name: 'Emergency Fund',
    target_amount: 20000000,
    linked_account_id: bri.id,
    target_date: null,
  });
  const mutualFund = await localCreateInvestment({
    name: 'Reksa Dana Pasar Uang',
    type: 'mutual_fund',
    current_value: 1500000,
  });
  if (expenseCat.food) {
    await localCreateBudget({ category_id: expenseCat.food, monthly_limit: 1000000, is_recurring: true });
  }
  if (expenseCat.utilities) {
    await localCreateBudget({ category_id: expenseCat.utilities, monthly_limit: 800000, is_recurring: true });
  }

  // ---- 3 months of activity (current month + previous 2) ----
  for (const mo of [0, -1, -2]) {
    if (incomeCat.salary) {
      await localCreateTransaction({
        type: 'income', amount: 8500000, txn_date: dateOn(mo, 1),
        note: 'Monthly salary', to_account_id: mandiri.id,
        category_id: incomeCat.salary, merchant_name: 'PT Maju Bersama',
      });
    }
    if (mo >= -1 && incomeCat.freelance) {
      await localCreateTransaction({
        type: 'income', amount: 750000, txn_date: dateOn(mo, 15),
        note: 'Freelance project', to_account_id: mandiri.id,
        category_id: incomeCat.freelance, merchant_name: 'Upwork',
      });
    }
    await localCreateTransaction({
      type: 'saving', amount: 1000000, txn_date: dateOn(mo, 3),
      note: 'Emergency fund top-up', from_account_id: mandiri.id,
      to_account_id: bri.id, saving_goal_id: emergencyGoal.id,
    });
    await localCreateTransaction({
      type: 'investment', amount: 500000, txn_date: dateOn(mo, 7),
      note: 'Monthly mutual fund', from_account_id: mandiri.id, investment_id: mutualFund.id,
    });
    await localCreateTransaction({
      type: 'expense', amount: 450000, txn_date: dateOn(mo, 2),
      note: 'Weekly groceries', from_account_id: cc.id,
      category_id: expenseCat.groceries, merchant_name: 'Alfamart',
    });
    await localCreateTransaction({
      type: 'expense', amount: 230000, txn_date: dateOn(mo, 4),
      note: 'Lunch outings', from_account_id: gopay.id,
      category_id: expenseCat.food, merchant_name: 'GoFood',
    });
    await localCreateTransaction({
      type: 'expense', amount: 100000, txn_date: dateOn(mo, 6),
      note: 'Gojek rides', from_account_id: gopay.id,
      category_id: expenseCat.transport, merchant_name: 'Gojek',
    });
    await localCreateTransaction({
      type: 'expense', amount: 750000, txn_date: dateOn(mo, 10),
      note: 'Electricity & internet', from_account_id: bri.id,
      category_id: expenseCat.utilities, merchant_name: 'PLN',
    });
    await localCreateTransaction({
      type: 'expense', amount: 350000, txn_date: dateOn(mo, 14),
      note: 'Online shopping', from_account_id: cc.id,
      category_id: expenseCat.shopping, merchant_name: 'Shopee',
    });
  }

  // ---- current-month extras to exercise the remaining types ----
  await localCreateTransaction({
    type: 'expense', amount: 120000, txn_date: dateOn(0, 5),
    note: 'Movie night', from_account_id: gopay.id,
    category_id: expenseCat.entertainment, merchant_name: 'CGV',
  });
  await localCreateTransaction({
    type: 'expense', amount: 95000, txn_date: dateOn(0, 7),
    note: 'Pharmacy', from_account_id: gopay.id,
    category_id: expenseCat.health, merchant_name: 'Kimia Farma',
  });
  await localCreateTransaction({
    type: 'transfer', amount: 1500000, txn_date: dateOn(0, 8),
    note: 'Move to savings', from_account_id: mandiri.id, to_account_id: bri.id,
  });
  await localCreateTransaction({
    type: 'transfer_out', amount: 100000, txn_date: dateOn(0, 9),
    note: 'Send to sister', from_account_id: gopay.id, to_person: 'Sister',
  });
  await localCreateTransaction({
    type: 'transfer_in', amount: 200000, txn_date: dateOn(0, 10),
    note: 'Online sale payout', to_account_id: mandiri.id, to_person: 'Buyer',
  });
}