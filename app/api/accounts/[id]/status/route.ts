import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { handleApiError, jsonError } from '@/lib/api-response';

/**
 * Lightweight read-only status endpoint - connection/health snapshot for a
 * single account, used by the Accounts page for a fast poll/refresh without
 * pulling the full account + settings payload.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getCurrentUser();
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('mt5_accounts')
      .select(
        'id, connection_status, trading_enabled, balance, equity, margin, free_margin, floating_pl, ea_connections(connected, last_heartbeat_at, last_sync_at, last_error)',
      )
      .eq('id', id)
      .single();

    if (error || !data) return jsonError('Account not found', 404);
    return NextResponse.json({ status: data });
  } catch (err) {
    return handleApiError(err);
  }
}
