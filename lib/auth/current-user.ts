import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/database';

export class UnauthenticatedError extends Error {
  constructor() {
    super('No authenticated user.');
    this.name = 'UnauthenticatedError';
  }
}

/** Resolves the logged-in user's auth identity + profile row (role, etc). */
export async function getCurrentUser(): Promise<{ authId: string; profile: Profile }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthenticatedError();

  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  if (error || !profile) throw new UnauthenticatedError();

  return { authId: user.id, profile: profile as Profile };
}
