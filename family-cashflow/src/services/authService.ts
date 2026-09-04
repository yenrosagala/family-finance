import { api, getToken, setToken } from './api';
import { Household, HouseholdMember } from '../models';

type AuthResponse = { token: string; user: { id: string; email: string; display_name: string } };

export async function signUp(email: string, password: string, displayName: string) {
  const data = await api.post<AuthResponse>('/api/auth/register', { email, password, displayName });
  await setToken(data.token);
  return data.user;
}

export async function signIn(email: string, password: string) {
  const data = await api.post<AuthResponse>('/api/auth/login', { email, password });
  await setToken(data.token);
  return data.user;
}

export async function signOut() {
  await setToken(null);
}

export async function getCurrentUser() {
  const token = await getToken();
  if (!token) return null;
  try {
    const data = await api.get<{ user: { id: string; email: string; display_name: string } }>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function createHousehold(name: string): Promise<Household> {
  const data = await api.post<{ household: Household }>('/api/household', { name });
  return data.household;
}

export async function joinHousehold(inviteCode: string): Promise<Household> {
  const data = await api.post<{ household: Household }>('/api/household/join', { inviteCode });
  return data.household;
}

export async function getUserHousehold(): Promise<Household | null> {
  const data = await api.get<{ household: Household | null }>('/api/household');
  return data.household;
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
  const data = await api.get<{ members: HouseholdMember[] }>('/api/household/members');
  return data.members;
}