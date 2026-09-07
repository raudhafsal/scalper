import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { strategySettingsSchema } from '@/lib/validation/schemas';
import { handleApiError, jsonError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const { profile } = await getCurrentUser();
    const supabase = await createServerSupabaseClient();

    const { data: strategy, error } = await supabase
      .from('strategies')
      .select('*, strategy_settings(*)')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !strategy) return jsonError('No strategy found', 404);
    return NextResponse.json({ strategy });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'strategy:write');

    const body = strategySettingsSchema.parse(await req.json());

    const totalWeight = Object.values(body.scoreWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return jsonError(`Score weights must sum to 100 (got ${totalWeight})`, 422);
    }

    const supabase = await createServerSupabaseClient();
    const { data: strategy } = await supabase
      .from('strategies')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .single();

    if (!strategy) return jsonError('No strategy found', 404);

    const { data: updated, error } = await supabase
      .from('strategy_settings')
      .update({
        primary_timeframe: body.primaryTimeframe,
        confirmation_timeframe: body.confirmationTimeframe,
        optional_timeframe: body.optionalTimeframe ?? null,
        min_signal_score: body.minSignalScore,
        score_weights: body.scoreWeights,
        structure_lookback: body.structureLookback,
        liquidity_lookback: body.liquidityLookback,
        ema_fast: body.emaFast,
        ema_mid: body.emaMid,
        ema_slow: body.emaSlow,
        ema_trend: body.emaTrend,
        rsi_period: body.rsiPeriod,
        atr_period: body.atrPeriod,
        sl_method: body.slMethod,
        atr_sl_multiplier: body.atrSlMultiplier,
        tp_mode: body.tpMode,
        custom_rr: body.customRr ?? null,
        breakeven_enabled: body.breakevenEnabled,
        breakeven_at_r: body.breakevenAtR,
        partial_tp_enabled: body.partialTpEnabled,
        partial_tp_at_r: body.partialTpAtR,
        partial_tp_pct: body.partialTpPct,
        trailing_enabled: body.trailingEnabled,
        session_filters: body.sessionFilters,
      })
      .eq('strategy_id', strategy.id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({ userId: profile.id, action: 'strategy.update', entityType: 'strategy_settings', entityId: strategy.id });

    return NextResponse.json({ strategySettings: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
