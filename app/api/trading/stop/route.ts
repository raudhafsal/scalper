import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleApiError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog, writeSystemEvent } from '@/lib/audit';
import { notifyEngineRefresh } from '@/lib/trading-engine-client';

/**
 * STOP NEW TRADES (spec section 33): stops new signal generation / new
 * entries, but existing open positions keep being managed (breakeven,
 * partials, trailing, SL/TP) according to their configured rules. This is
 * intentionally distinct from Emergency Stop and Close All.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'trading:stop');

    const { ok } = rateLimit(`trading:stop:${profile.id}`, 10, 60_000);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from('trading_state')
      .update({ status: 'STOP_NEW_TRADES', stopped_at: new Date().toISOString(), stopped_by: profile.id })
      .eq('user_id', profile.id)
      .select()
      .single();

    if (error) throw error;

    await Promise.all([
      writeAuditLog({ userId: profile.id, action: 'trading.stop_new_trades', entityType: 'trading_state', entityId: profile.id }),
      writeSystemEvent({
        component: 'TRADING_ENGINE',
        eventType: 'trading.stop_new_trades',
        severity: 'WARNING',
        message: 'New trade entries stopped; existing positions continue to be managed.',
      }),
      notifyEngineRefresh(profile.id),
    ]);

    return NextResponse.json({ tradingState: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
