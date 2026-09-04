import { api } from './api';

export interface NetWorthCurrent {
  accounts: number;
  investments: number;
  assets: number;
  total_assets: number;
  liabilities: number;
  net_worth: number;
}

export interface NetWorthHistoryPoint {
  month: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export async function getNetWorth(): Promise<{ current: NetWorthCurrent; history: NetWorthHistoryPoint[] }> {
  const data = await api.get<{ current: NetWorthCurrent; history: NetWorthHistoryPoint[] }>(
    '/api/net-worth'
  );
  return data;
}
