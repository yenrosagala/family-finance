import { api } from './api';
import { Budget } from '../models';
import { isLocalMode } from '../core/dataSource';
import {
  localGetBudgets,
  localCreateBudget,
  localUpdateBudget,
  localDeleteBudget,
} from './local/repository';

export interface BudgetProgress extends Budget {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  spent: number;
  remaining: number;
  over_budget: boolean;
  progress: number; // 0..1
}

export async function getBudgets(month?: string): Promise<{
  budgets: BudgetProgress[];
  month: string;
}> {
  if (await isLocalMode()) {
    return localGetBudgets(month);
  }
  const qs = month ? `?month=${month}` : '';
  const data = await api.get<{ budgets: BudgetProgress[]; month: string }>(`/api/budgets${qs}`);
  return data;
}

export interface BudgetInput {
  category_id: string;
  monthly_limit: number;
  month?: string | null;
  is_recurring?: boolean;
  rollover?: boolean;
}

export async function createBudget(input: BudgetInput): Promise<Budget> {
  if (await isLocalMode()) return localCreateBudget(input);
  const data = await api.post<{ budget: Budget }>('/api/budgets', input);
  return data.budget;
}

export async function updateBudget(
  id: string,
  input: Partial<Pick<BudgetInput, 'monthly_limit' | 'month' | 'is_recurring' | 'rollover'>>
): Promise<Budget> {
  if (await isLocalMode()) return localUpdateBudget(id, input);
  const data = await api.put<{ budget: Budget }>(`/api/budgets/${id}`, input);
  return data.budget;
}

export async function deleteBudget(id: string): Promise<void> {
  if (await isLocalMode()) return localDeleteBudget(id);
  await api.del(`/api/budgets/${id}`);
}
