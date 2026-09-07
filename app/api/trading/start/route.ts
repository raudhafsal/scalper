import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startTradingSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog, writeSystemEvent } from '@/lib/audit';
import { notifyEngineRefresh } from '@/lib/trading-engine-client';
import { runPreflightChecks } from '@/lib/trading/preflight';

export async function POST(req: NextRequest) {
  try {
    const { authId, profile } = await getCurrentUser();
    assertPermission(profile.role, 'trading:start');

    const { ok } = rateLimit(`trading:start:${authId}`, 5, 60_000);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = startTradingSchema.parse(await req.json());

    const supabase = await createServerSupabaseClient();

    // Ownership check happens implicitly via RLS on this select.
    const { data: accounts, error: accError } = await supabase
      .from('mt5_accounts')
      .select('id')
      .in('id', body.accountIds);

    if (accError || (accounts ?? []).length !== body.accountIds.length) {
      return NextResponse.json({ error: 'One or more accounts were not found' }, { status: 404 });
    }

    const { checks, allPassed } = await runPreflightChecks(supabase, profile, body.mode, body.accountIds);

    if (!allPassed) {
      return NextResponse.json({ error: 'Pre-flight checks failed', checks }, { status: 409 });
    }

    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from('trading_state')
      .update({
        status: 'ACTIVE',
        mode: body.mode,
        started_at: new Date().toISOString(),
        started_by: profile.id,
        stopped_at: null,
        stopped_by: null,
        emergency_stop_reason: null,
      })
      .eq('user_id', profile.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await Promise.all([
      writeAuditLog({
        userId: profile.id,
        action: 'trading.start',
        entityType: 'trading_state',
        entityId: profile.id,
        metadata: { mode: body.mode, accountIds: body.accountIds },
      }),
      writeSystemEvent({
        component: 'TRADING_ENGINE',
        eventType: 'trading.start',
        message: `Auto trading started in ${body.mode} mode for ${body.accountIds.length} account(s).`,
        metadata: { mode: body.mode, accountCount: body.accountIds.length },
      }),
      notifyEngineRefresh(profile.id),
    ]);

    return NextResponse.json({ tradingState: updated, checks });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const { profile } = await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const { data: accounts } = await supabase.from('mt5_accounts').select('id').eq('trading_enabled', true);
    const accountIds = (accounts ?? []).map((a) => a.id);
    const { checks, allPassed } = await runPreflightChecks(supabase, profile, 'PAPER', accountIds);
    return NextResponse.json({ checks, allPassed });
  } catch (err) {
    return handleApiError(err);
  }
}
