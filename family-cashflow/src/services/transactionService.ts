import { api } from './api';
import { Transaction, Account, Category } from '../models';

export async function getAccounts(): Promise<Account[]> {
  const data = await api.get<{ accounts: Account[] }>('/api/accounts');
  return data.accounts;
}

export async function createAccount(account: {
  name: string;
  type: string;
  currency?: string;
  openingBalance?: number;
}): Promise<Account> {
  const data = await api.post<{ account: Account }>('/api/accounts', account);
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  await api.del(`/api/accounts/${id}`);
}

export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const qs = type ? `?type=${type}` : '';
  const data = await api.get<{ categories: Category[] }>(`/api/categories${qs}`);
  return data.categories;
}

export async function createCategory(category: {
  name: string;
  transaction_type: 'income' | 'expense';
  icon?: string;
  color?: string;
}): Promise<Category> {
  const data = await api.post<{ category: Category }>('/api/categories', category);
  return data.category;
}

export async function getTransactions(options?: {
  limit?: number;
  startDate?: string;
  endDate?: string;
  type?: string;
  categoryId?: string;
}): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.type) params.set('type', options.type);
  if (options?.categoryId) params.set('categoryId', options.categoryId);

  const qs = params.toString();
  const data = await api.get<{ transactions: Transaction[] }>(`/api/transactions${qs ? `?${qs}` : ''}`);
  return data.transactions;
}

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'household_id' | 'created_at' | 'added_by'>
): Promise<Transaction> {
  const data = await api.post<{ transaction: Transaction }>('/api/transactions', transaction);
  return data.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.del(`/api/transactions/${id}`);
}

export async function getMonthlySummary(year: number, month: number) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const data = await api.get<{
    summary: {
      income: number;
      expense: number;
      net_cashflow: number;
      saved: number;
      invested: number;
      month: string;
    };
  }>(`/api/transactions/summary?month=${monthKey}`);
  return {
    income: data.summary.income,
    expenses: data.summary.expense,
    netCashflow: data.summary.net_cashflow,
    saved: data.summary.saved,
    invested: data.summary.invested,
  };
}

export interface CategoryBreakdownItem {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  total: number;
}

export async function getCategoryBreakdown(year: number, month: number, type: 'income' | 'expense') {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const data = await api.get<{ breakdown: CategoryBreakdownItem[] }>(
    `/api/transactions/breakdown?month=${monthKey}&type=${type}`
  );
  return data.breakdown;
}