import { api } from './api';
import { Investment } from '../models';
import { isLocalMode } from '../core/dataSource';
import {
  localGetInvestments,
  localCreateInvestment,
  localUpdateInvestment,
  localDeleteInvestment,
} from './local/repository';

export interface InvestmentProgress extends Investment {
  gain_loss: number;
  gain_loss_pct: number;
}

export async function getInvestments(): Promise<InvestmentProgress[]> {
  if (await isLocalMode()) return localGetInvestments();
  const data = await api.get<{ investments: InvestmentProgress[] }>('/api/investments');
  return data.investments;
}

export interface InvestmentInput {
  name: string;
  type: string;
  current_value?: number;
}

export async function createInvestment(input: InvestmentInput): Promise<Investment> {
  if (await isLocalMode()) return localCreateInvestment(input);
  const data = await api.post<{ investment: Investment }>('/api/investments', input);
  return data.investment;
}

export async function updateInvestment(
  id: string,
  input: Partial<InvestmentInput>
): Promise<Investment> {
  if (await isLocalMode()) return localUpdateInvestment(id, input);
  const data = await api.put<{ investment: Investment }>(`/api/investments/${id}`, input);
  return data.investment;
}

export async function deleteInvestment(id: string): Promise<void> {
  if (await isLocalMode()) return localDeleteInvestment(id);
  await api.del(`/api/investments/${id}`);
}
