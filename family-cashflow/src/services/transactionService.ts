import { api } from './api';
import { Transaction, Account, Category } from '../models';
import { isLocalMode } from '../core/dataSource';
import {
  localGetAccounts,
  localCreateAccount,
  localDeleteAccount,
  localGetCategories,
  localCreateCategory,
  localGetTransactions,
  localCreateTransaction,
  localUpdateTransaction,
  localDeleteTransaction,
  localGetMonthlySummary,
  localGetCategoryBreakdown,
  localGetCategoryBreakdownRange,
  localGetSeries,
} from './local/repository';

export async function getAccounts(): Promise<Account[]> {
  if (await isLocalMode()) return localGetAccounts();
  const data = await api.get<{ accounts: Account[] }>('/api/accounts');
  return data.accounts;
}

export async function createAccount(account: {
  name: string;
  type: string;
  currency?: string;
  openingBalance?: number;
}): Promise<Account> {
  if (await isLocalMode()) return localCreateAccount(account);
  const data = await api.post<{ account: Account }>('/api/accounts', account);
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  if (await isLocalMode()) return localDeleteAccount(id);
  await api.del(`/api/accounts/${id}`);
}

export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  if (await isLocalMode()) return localGetCategories(type);
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
  if (await isLocalMode()) return localCreateCategory(category);
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
  if (await isLocalMode()) return localGetTransactions(options);
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
  if (await isLocalMode()) return localCreateTransaction(transaction);
  const data = await api.post<{ transaction: Transaction }>('/api/transactions', transaction);
  return data.transaction;
}

export async function updateTransaction(
  id: string,
  patch: Partial<Omit<Transaction, 'id' | 'household_id' | 'added_by' | 'created_at'>>
): Promise<Transaction> {
  if (await isLocalMode()) return localUpdateTransaction(id, patch as Partial<Transaction>);
  const data = await api.put<{ transaction: Transaction }>(`/api/transactions/${id}`, patch);
  return data.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  if (await isLocalMode()) return localDeleteTransaction(id);
  await api.del(`/api/transactions/${id}`);
}

export async function getMonthlySummary(year: number, month: number) {
  if (await isLocalMode()) {
    const s = await localGetMonthlySummary(year, month);
    return { income: s.income, expenses: s.expense, netCashflow: s.net_cashflow, saved: s.saved, invested: s.invested };
  }
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

export interface SeriesPoint {
  label: string;
  income: number;
  expense: number;
  saved: number;
  invested: number;
}

export type SeriesBucket = 'day' | 'week' | 'month';

export async function getCategoryBreakdown(year: number, month: number, type: 'income' | 'expense') {
  if (await isLocalMode()) return localGetCategoryBreakdown(year, month, type);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const data = await api.get<{ breakdown: CategoryBreakdownItem[] }>(
    `/api/transactions/breakdown?month=${monthKey}&type=${type}`
  );
  return data.breakdown;
}

export async function getCategoryBreakdownRange(
  startDate: string,
  endDate: string,
  type: 'income' | 'expense'
): Promise<CategoryBreakdownItem[]> {
  if (await isLocalMode()) return localGetCategoryBreakdownRange(startDate, endDate, type);
  const data = await api.get<{ breakdown: CategoryBreakdownItem[] }>(
    `/api/transactions/breakdown?startDate=${startDate}&endDate=${endDate}&type=${type}`
  );
  return data.breakdown;
}

export async function getSeries(
  bucket: SeriesBucket,
  startDate: string,
  endDate: string
): Promise<SeriesPoint[]> {
  if (await isLocalMode()) return localGetSeries(bucket, startDate, endDate);
  const data = await api.get<{ series: SeriesPoint[] }>(
    `/api/transactions/series?bucket=${bucket}&startDate=${startDate}&endDate=${endDate}`
  );
  return data.series;
}