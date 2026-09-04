import supabase from './supabase';
import { Transaction, Account, Category } from '../models';
import { getCurrentUser } from './authService';

async function getHouseholdId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (error || !data) throw new Error('No household found');
  return data.household_id;
}

export async function getAccounts(): Promise<Account[]> {
  const householdId = await getHouseholdId();
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export async function createAccount(account: Omit<Account, 'id' | 'household_id' | 'balance' | 'created_at'>): Promise<Account> {
  const householdId = await getHouseholdId();
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      ...account,
      household_id: householdId,
      balance: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const householdId = await getHouseholdId();
  let query = supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('name');

  if (type) {
    query = query.eq('transaction_type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(category: Omit<Category, 'id' | 'household_id' | 'created_at'>): Promise<Category> {
  const householdId = await getHouseholdId();
  const { data, error } = await supabase
    .from('categories')
    .insert({
      ...category,
      household_id: householdId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTransactions(options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  type?: string;
  categoryId?: string;
}): Promise<Transaction[]> {
  const householdId = await getHouseholdId();
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .order('txn_date', { ascending: false });

  if (options?.startDate) {
    query = query.gte('txn_date', options.startDate);
  }
  if (options?.endDate) {
    query = query.lte('txn_date', options.endDate);
  }
  if (options?.type) {
    query = query.eq('type', options.type);
  }
  if (options?.categoryId) {
    query = query.eq('category_id', options.categoryId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'household_id' | 'created_at' | 'added_by'>
): Promise<Transaction> {
  const householdId = await getHouseholdId();
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...transaction,
      household_id: householdId,
      added_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Omit<Transaction, 'id' | 'household_id' | 'created_at' | 'added_by'>>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getMonthlySummary(year: number, month: number) {
  const householdId = await getHouseholdId();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, category_id')
    .eq('household_id', householdId)
    .gte('txn_date', startDate)
    .lt('txn_date', endDate);

  if (error) throw error;

  const income = (data ?? [])
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = (data ?? [])
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    income,
    expenses,
    netCashflow: income - expenses,
  };
}
