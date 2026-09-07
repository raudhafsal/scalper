import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { riskSettingsSchema } from '@/lib/validation/schemas';
import { handleApiError, jsonError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const { profile } = await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('risk_settings')
      .select('*')
      .eq('user_id', profile.id)
      .order('is_default', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ riskSettings: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'risk:write');

    const { searchParams } = new URL(req.url);
    const riskSettingsId = searchParams.get('id');
    if (!riskSettingsId) return jsonError('Missing ?id=<risk_settings_id>', 400);

    const body = riskSettingsSchema.parse(await req.json());
    const supabase = await createServerSupabaseClient();

    const { data: updated, error } = await supabase
      .from('risk_settings')
      .update({
        risk_per_trade_pct: body.riskPerTradePct,
        max_daily_loss_pct: body.maxDailyLossPct,
        max_drawdown_pct: body.maxDrawdownPct,
        max_simultaneous_trades: body.maxSimultaneousTrades,
        max_trades_per_symbol: body.maxTradesPerSymbol,
        max_trades_per_day: body.maxTradesPerDay,
        max_trades_per_hour: body.maxTradesPerHour,
        max_consecutive_losses: body.maxConsecutiveLosses,
        cooldown_after_loss_minutes: body.cooldownAfterLossMinutes,
        cooldown_after_trade_minutes: body.cooldownAfterTradeMinutes,
        max_spread_points: body.maxSpreadPoints,
        max_lot: body.maxLot,
        min_equity: body.minEquity,
        daily_profit_lock_pct: body.dailyProfitLockPct ?? null,
      })
      .eq('id', riskSettingsId)
      .eq('user_id', profile.id)
      .select()
      .single();

    if (error || !updated) return jsonError('Risk profile not found', 404);

    await writeAuditLog({ userId: profile.id, action: 'risk.update', entityType: 'risk_settings', entityId: riskSettingsId });

    return NextResponse.json({ riskSettings: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
