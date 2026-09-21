import { api, getToken, setToken } from './api';
import { Household, HouseholdMember } from '../models';
import { isLocalMode } from '../core/dataSource';
import {
  localSignUp,
  localSignIn,
  localSignOut,
  localGetCurrentUser,
  localGetUserHousehold,
  localGetHouseholdMembers,
  localRefreshInviteCode,
} from './local/repository';

type AuthResponse = { token: string; user: { id: string; email: string; display_name: string } };

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  household: { mode: 'create'; householdName: string } | { mode: 'join'; inviteCode: string }
) {
  if (await isLocalMode()) {
    // Local mode always creates a fresh household on sign-up; joining isn't
    // supported offline (single-device storage), so household.mode is ignored.
    return localSignUp(email, password, displayName);
  }
  if (household.mode === 'create') {
    const data = await api.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      displayName,
      householdName: household.householdName,
    });
    await setToken(data.token);
    return data.user;
  }
  const data = await api.post<AuthResponse>('/api/auth/join', {
    email,
    password,
    displayName,
    inviteCode: household.inviteCode,
  });
  await setToken(data.token);
  return data.user;
}

export async function signIn(email: string, password: string) {
  if (await isLocalMode()) {
    return localSignIn(email, password);
  }
  const data = await api.post<AuthResponse>('/api/auth/login', { email, password });
  await setToken(data.token);
  return data.user;
}

export async function signOut() {
  if (await isLocalMode()) {
    await localSignOut();
    return;
  }
  await setToken(null);
}

export async function getCurrentUser() {
  if (await isLocalMode()) {
    return localGetCurrentUser();
  }
  const token = await getToken();
  if (!token) return null;
  try {
    const data = await api.get<{ user: { id: string; email: string; display_name: string } }>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function getUserHousehold(): Promise<Household | null> {
  if (await isLocalMode()) {
    return localGetUserHousehold();
  }
  const data = await api.get<{ household: Household | null }>('/api/household');
  return data.household;
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
  if (await isLocalMode()) {
    return localGetHouseholdMembers();
  }
  const data = await api.get<{ members: HouseholdMember[] }>('/api/household/members');
  return data.members;
}

export async function refreshInviteCode(): Promise<string> {
  if (await isLocalMode()) {
    return localRefreshInviteCode();
  }
  const data = await api.post<{ inviteCode: string }>(
    '/api/household/invite-code/refresh',
    {}
  );
  return data.inviteCode;
}