import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { emergencyStopSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog, writeSystemEvent } from '@/lib/audit';
import { notifyEngineRefresh } from '@/lib/trading-engine-client';

/**
 * EMERGENCY STOP ALL (spec section 34). This is deliberately belt-and-braces:
 *  1. Flip trading_state to EMERGENCY_STOPPED immediately (the engine's poll
 *     loop treats this as an absolute gate - see fail-safe rule, section 45).
 *  2. Also push an explicit STOP_TRADING command to every connected account
 *     so the EA itself stops accepting new commands even if it never
 *     re-checks trading_state on its own.
 *  3. Audit + a CRITICAL system event.
 * Requires the exact confirmation phrase "EMERGENCY STOP" from the client -
 * enforced both in the UI (confirmation modal) and here server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'trading:emergency_stop');

    const { ok } = rateLimit(`trading:emergency:${profile.id}`, 10, 60_000);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = emergencyStopSchema.parse(await req.json());

    const admin = createAdminClient();

    const { data: updated, error } = await admin
      .from('trading_state')
      .update({
        status: 'EMERGENCY_STOPPED',
        stopped_at: new Date().toISOString(),
        stopped_by: profile.id,
        emergency_stop_reason: body.reason,
      })
      .eq('user_id', profile.id)
      .select()
      .single();

    if (error) throw error;

    const { data: accounts } = await admin
      .from('mt5_accounts')
      .select('id')
      .eq('user_id', profile.id);

    const commandRows = (accounts ?? []).map((a) => ({
      account_id: a.id,
      action: 'STOP_TRADING' as const,
      symbol: 'ALL',
      nonce: randomUUID(),
      status: 'PENDING' as const,
      run_mode: updated.mode,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));

    if (commandRows.length > 0) {
      await admin.from('trade_commands').insert(commandRows);
    }

    await Promise.all([
      writeAuditLog({
        userId: profile.id,
        action: 'trading.emergency_stop',
        entityType: 'trading_state',
        entityId: profile.id,
        metadata: { reason: body.reason, accountsNotified: commandRows.length },
      }),
      writeSystemEvent({
        component: 'TRADING_ENGINE',
        eventType: 'trading.emergency_stop',
        severity: 'CRITICAL',
        message: `EMERGENCY STOP triggered by ${profile.email}: ${body.reason}`,
        metadata: { accountsNotified: commandRows.length },
      }),
      notifyEngineRefresh(profile.id),
    ]);

    return NextResponse.json({ tradingState: updated, accountsNotified: commandRows.length });
  } catch (err) {
    return handleApiError(err);
  }
}
