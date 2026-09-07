import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';
import { computePerformanceMetrics, sessionForTimestamp } from '@/lib/analytics';

/**
 * On-demand analytics computed directly from closed_trades - always derived
 * from real recorded fills, never fabricated (spec section 38/56).
 */
export async function GET(req: NextRequest) {
  try {
    await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = await createServerSupabaseClient();
    let query = supabase.from('closed_trades').select('*').order('close_time', { ascending: true });
    if (accountId) query = query.eq('account_id', accountId);
    if (from) query = query.gte('close_time', from);
    if (to) query = query.lte('close_time', to);

    const { data: trades, error } = await query;
    if (error) throw error;

    const metrics = computePerformanceMetrics(trades ?? []);

    const bySymbol: Record<string, ReturnType<typeof computePerformanceMetrics>> = {};
    const byStrategy: Record<string, ReturnType<typeof computePerformanceMetrics>> = {};
    const bySession: Record<string, ReturnType<typeof computePerformanceMetrics>> = {};

    for (const symbol of new Set((trades ?? []).map((t) => t.symbol))) {
      bySymbol[symbol] = computePerformanceMetrics((trades ?? []).filter((t) => t.symbol === symbol));
    }
    for (const strategyId of new Set((trades ?? []).map((t) => t.strategy_id).filter(Boolean))) {
      byStrategy[strategyId as string] = computePerformanceMetrics(
        (trades ?? []).filter((t) => t.strategy_id === strategyId),
      );
    }
    for (const trade of trades ?? []) {
      const session = sessionForTimestamp(trade.open_time);
      bySession[session] ??= computePerformanceMetrics([]);
    }
    for (const session of Object.keys(bySession)) {
      bySession[session] = computePerformanceMetrics(
        (trades ?? []).filter((t) => sessionForTimestamp(t.open_time) === session),
      );
    }

    return NextResponse.json({ overall: metrics, bySymbol, byStrategy, bySession, tradeCount: trades?.length ?? 0 });
  } catch (err) {
    return handleApiError(err);
  }
}
