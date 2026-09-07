import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS entirely - this may ONLY be
 * imported from server-side code that needs to write to system-owned tables
 * (signals, trade_commands, trade_executions, positions, closed_trades,
 * daily_statistics, performance_statistics, system_events, audit_logs) or
 * from the /api/ea/* webhook handlers that authenticate the caller
 * themselves via the bridge token rather than a Supabase session.
 *
 * The `server-only` import above makes any accidental import of this module
 * from a Client Component fail the build, so a leak of the service-role key
 * to the browser is caught at compile time, not discovered in production.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set on the server.',
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
