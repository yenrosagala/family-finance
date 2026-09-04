import supabase from './supabase';
import { Household, HouseholdMember } from '../models';

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function createHousehold(name: string): Promise<Household> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { data, error } = await supabase
    .from('households')
    .insert({
      name,
      invite_code: inviteCode,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;

  const { error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: data.id,
      user_id: user.id,
      display_name: user.email?.split('@')[0] ?? 'Member',
      role: 'admin',
    });

  if (memberError) throw memberError;

  return data;
}

export async function joinHousehold(inviteCode: string): Promise<Household> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { data: household, error: findError } = await supabase
    .from('households')
    .select('*')
    .eq('invite_code', inviteCode)
    .single();

  if (findError) throw new Error('Invalid invite code');

  const { error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      user_id: user.id,
      display_name: user.email?.split('@')[0] ?? 'Member',
      role: 'member',
    });

  if (memberError) throw memberError;

  return household;
}

export async function getUserHousehold(): Promise<Household | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('household:households(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  return (data.household as unknown as Household) ?? null;
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) return [];

  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', membership.household_id);

  if (error) throw error;
  return data ?? [];
}
