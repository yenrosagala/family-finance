import { api } from './api';
import { SavingGoal } from '../models';
import { isLocalMode } from '../core/dataSource';
import {
  localGetSavingGoals,
  localCreateSavingGoal,
  localUpdateSavingGoal,
  localDeleteSavingGoal,
} from './local/repository';

export interface SavingGoalProgress extends SavingGoal {
  account_name: string | null;
  progress: number; // 0..1
  remaining: number;
}

export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  // target_date comes back as an ISO timestamp (e.g. ...T15:00:00.000Z); take the date part.
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function getSavingGoals(): Promise<SavingGoalProgress[]> {
  if (await isLocalMode()) return localGetSavingGoals();
  const data = await api.get<{ goals: SavingGoalProgress[] }>('/api/saving-goals');
  return data.goals;
}

export interface SavingGoalInput {
  name: string;
  target_amount: number;
  target_date?: string | null;
  linked_account_id?: string | null;
}

export async function createSavingGoal(input: SavingGoalInput): Promise<SavingGoal> {
  if (await isLocalMode()) return localCreateSavingGoal(input);
  const data = await api.post<{ goal: SavingGoal }>('/api/saving-goals', input);
  return data.goal;
}

export async function updateSavingGoal(
  id: string,
  input: Partial<SavingGoalInput>
): Promise<SavingGoal> {
  if (await isLocalMode()) return localUpdateSavingGoal(id, input);
  const data = await api.put<{ goal: SavingGoal }>(`/api/saving-goals/${id}`, input);
  return data.goal;
}

export async function deleteSavingGoal(id: string): Promise<void> {
  if (await isLocalMode()) return localDeleteSavingGoal(id);
  await api.del(`/api/saving-goals/${id}`);
}
