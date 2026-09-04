import { api } from './api';

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface ReportItem {
  name: string;
  color: string | null;
  icon: string | null;
  amount: number;
}

export interface IncomeStatement {
  month: string;
  income: { items: ReportItem[]; total: number };
  expense: { items: ReportItem[]; total: number };
  net_cashflow: number;
}

export async function getIncomeStatement(year: number, month: number): Promise<IncomeStatement> {
  return api.get<IncomeStatement>(`/api/reports/pl?year=${year}&month=${month}`);
}

export interface BalanceSheet {
  accounts: { id: string; name: string; balance: number }[];
  investments: { id: string; name: string; value: number }[];
  assets: { id: string; name: string; type: string; value: number }[];
  liabilities: { id: string; name: string; type: string; balance: number }[];
  totals: {
    accounts: number;
    investments: number;
    real_assets: number;
    assets: number;
    liabilities: number;
    net_worth: number;
  };
}

export async function getBalanceSheet(): Promise<BalanceSheet> {
  return api.get<BalanceSheet>('/api/reports/balance-sheet');
}

export interface PeriodValues {
  month: string;
  income: number;
  expense: number;
  net_cashflow: number;
  saved: number;
  invested: number;
}

export interface ComparisonReport {
  current: string;
  previous: string;
  current_values: PeriodValues;
  previous_values: PeriodValues;
  deltas: {
    income: number;
    expense: number;
    net_cashflow: number;
    saved: number;
    invested: number;
  };
}

export async function getComparison(year: number, month: number): Promise<ComparisonReport> {
  return api.get<ComparisonReport>(`/api/reports/compare?year=${year}&month=${month}`);
}

export { monthKey };
