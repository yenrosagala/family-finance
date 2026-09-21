import { api, API_BASE_URL, getToken } from './api';
import { isLocalMode, localUnavailable } from '../core/dataSource';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import XLSX from 'xlsx';
import {
  localGetCategoryBreakdown,
  localGetMonthlySummary,
  localGetUserHousehold,
} from './local/repository';

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

async function guardLocal(): Promise<void> {
  if (await isLocalMode()) throw localUnavailable('Reports');
}

export async function getIncomeStatement(year: number, month: number): Promise<IncomeStatement> {
  await guardLocal();
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
  await guardLocal();
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
  await guardLocal();
  return api.get<ComparisonReport>(`/api/reports/compare?year=${year}&month=${month}`);
}

export { monthKey };

export type StatementFormat = 'xlsx' | 'pdf';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Failed to read downloaded file'));
    reader.readAsDataURL(blob);
  });
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtAmount(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency || 'IDR'} ${Number(n || 0).toLocaleString('en-US')}`;
  }
}

async function buildLocalStatement(
  year: number,
  month: number,
  format: StatementFormat
): Promise<{ uri: string }> {
  const [summary, income, expense, house] = await Promise.all([
    localGetMonthlySummary(year, month),
    localGetCategoryBreakdown(year, month, 'income'),
    localGetCategoryBreakdown(year, month, 'expense'),
    localGetUserHousehold(),
  ]);
  const householdName = house?.name || 'Family Finance';
  const currency = house?.currency || 'IDR';
  const monthLabel = monthKey(year, month);
  const incomeItems = income.map((r) => ({ category: r.name, amount: r.total }));
  const expenseItems = expense.map((r) => ({ category: r.name, amount: r.total }));
  const uri = FileSystem.cacheDirectory + `financial-statement-${monthLabel}.${format}`;

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [`${householdName} — Monthly Financial Statement`],
        ['Period', monthLabel],
        [],
        ['Income', summary.income],
        ['Expense', summary.expense],
        ['Savings', summary.saved],
        ['Investments', summary.invested],
        ['Net Cashflow', summary.net_cashflow],
      ]),
      'Summary'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(incomeItems.map((i) => ({ Category: i.category, Amount: i.amount }))),
      'Income'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(expenseItems.map((i) => ({ Category: i.category, Amount: i.amount }))),
      'Expense'
    );
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return { uri };
  }

  const categoryRows = (items: { category: string; amount: number }[]) =>
    items
      .map(
        (i) =>
          `<tr><td>${esc(i.category)}</td><td style="text-align:right">${fmtAmount(i.amount, currency)}</td></tr>`
      )
      .join('');
  const summaryRows = [
    ['Income', summary.income],
    ['Expense', summary.expense],
    ['Savings', summary.saved],
    ['Investments', summary.invested],
    ['Net Cashflow', summary.net_cashflow],
  ]
    .map(
      ([label, value]) =>
        `<tr><td><strong>${label}</strong></td><td style="text-align:right">${fmtAmount(Number(value), currency)}</td></tr>`
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; }
    h1 { font-size: 18px; text-align: center; margin-bottom: 2px; }
    .sub { text-align: center; margin: 0 0 20px; color: #444; }
    h2 { font-size: 14px; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #ccc; padding: 4px 6px; }
    th { background: #eee; text-align: left; }
  </style></head><body>
    <h1>${esc(householdName)}</h1>
    <p class="sub">Monthly Financial Statement — ${monthLabel}</p>
    <h2>Summary</h2>
    <table>${summaryRows}</table>
    <h2>Income by Category</h2>
    <table><tr><th>Category</th><th>Amount</th></tr>${categoryRows(incomeItems)}</table>
    <h2>Expense by Category</h2>
    <table><tr><th>Category</th><th>Amount</th></tr>${categoryRows(expenseItems)}</table>
  </body></html>`;
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('Failed to render PDF');
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri };
}

export async function downloadMonthlyStatement(
  year: number,
  month: number,
  format: StatementFormat
): Promise<{ uri: string }> {
  if (await isLocalMode()) return buildLocalStatement(year, month, format);
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `${API_BASE_URL}/api/reports/export?year=${year}&month=${month}&format=${format}`,
    { headers }
  );
  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed (${res.status})`;
    try {
      message = JSON.parse(text).error || message;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const name = `financial-statement-${monthKey(year, month)}.${format}`;
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, await blobToBase64(blob), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri };
}

export async function shareMonthlyStatement(
  year: number,
  month: number,
  format: StatementFormat
): Promise<void> {
  const { uri } = await downloadMonthlyStatement(year, month, format);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: format === 'pdf' ? 'com.adobe.pdf' : undefined,
    });
  }
}
