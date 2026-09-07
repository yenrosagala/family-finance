import { api } from './api';
import { Liability } from '../models';
import { isLocalMode, localUnavailable } from '../core/dataSource';

export const LIABILITY_TYPES = ['mortgage', 'loan', 'credit_card', 'other'] as const;
export const LIABILITY_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Mortgage',
  loan: 'Loan',
  credit_card: 'Credit Card',
  other: 'Other',
};

export async function getLiabilities(): Promise<Liability[]> {
  if (await isLocalMode()) return [];
  const data = await api.get<{ liabilities: Liability[] }>('/api/liabilities');
  return data.liabilities;
}

export interface LiabilityInput {
  name: string;
  type: string;
  current_balance?: number;
  original_amount?: number | null;
  interest_rate?: number | null;
}

export async function createLiability(input: LiabilityInput): Promise<Liability> {
  if (await isLocalMode()) throw localUnavailable('Liabilities');
  const data = await api.post<{ liability: Liability }>('/api/liabilities', input);
  return data.liability;
}

export async function updateLiability(id: string, input: Partial<LiabilityInput>): Promise<Liability> {
  if (await isLocalMode()) throw localUnavailable('Liabilities');
  const data = await api.put<{ liability: Liability }>(`/api/liabilities/${id}`, input);
  return data.liability;
}

export async function deleteLiability(id: string): Promise<void> {
  if (await isLocalMode()) throw localUnavailable('Liabilities');
  await api.del(`/api/liabilities/${id}`);
}
