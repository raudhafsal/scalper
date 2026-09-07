import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { closeAllSchema } from '@/lib/validation/schemas';
import { handleApiError, jsonError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog, writeSystemEvent } from '@/lib/audit';
import { notifyEngineRefresh } from '@/lib/trading-engine-client';

/**
 * CLOSE ALL POSITIONS (spec section 35). Deliberately a *separate* action
 * from Emergency Stop - it does not change trading_state at all, it only
 * queues CLOSE commands for every currently open position on the selected
 * accounts. Requires its own strong confirmation phrase. Returns a
 * per-account summary of how many CLOSE commands were queued; actual fill
 * results stream back later via /api/ea/trade-result and Realtime.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'trading:close_all');

    const { ok } = rateLimit(`trading:close_all:${profile.id}`, 5, 60_000);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = closeAllSchema.parse(await req.json());

    const supabase = await createServerSupabaseClient();
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('id, account_id, symbol, broker_ticket')
      .in('account_id', body.accountIds)
      .eq('status', 'OPEN');

    if (posError) return jsonError(posError.message, 500);

    if (!positions || positions.length === 0) {
      return NextResponse.json({ queued: 0, byAccount: {} });
    }

    const admin = createAdminClient();
    const commandRows = positions.map((p) => ({
      account_id: p.account_id,
      action: 'CLOSE' as const,
      symbol: p.symbol,
      // Idempotency key ties this CLOSE command to this specific position so
      // a retried request can never issue two close orders for one ticket.
      nonce: `close-${p.broker_ticket}`,
      status: 'PENDING' as const,
      expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    }));

    const { error: insertError } = await admin.from('trade_commands').upsert(commandRows, {
      onConflict: 'account_id,nonce',
      ignoreDuplicates: true,
    });
    if (insertError) throw insertError;

    const byAccount: Record<string, number> = {};
    for (const p of positions) byAccount[p.account_id] = (byAccount[p.account_id] ?? 0) + 1;

    await Promise.all([
      writeAuditLog({
        userId: profile.id,
        action: 'trading.close_all',
        entityType: 'positions',
        metadata: { accountIds: body.accountIds, queued: positions.length },
      }),
      writeSystemEvent({
        component: 'TRADING_ENGINE',
        eventType: 'trading.close_all',
        severity: 'WARNING',
        message: `Close-all requested by ${profile.email}: ${positions.length} position(s) queued for closure.`,
      }),
      notifyEngineRefresh(profile.id),
    ]);

    return NextResponse.json({ queued: positions.length, byAccount });
  } catch (err) {
    return handleApiError(err);
  }
}
