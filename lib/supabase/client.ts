'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Uses only the anon key (safe to ship to the
 * client) and is subject to Row Level Security - it can never see another
 * user's data and can never write to server-only tables (see the RLS
 * migration for exactly what the browser is allowed to touch).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
