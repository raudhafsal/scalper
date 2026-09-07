import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computePerformanceMetrics } from '@/lib/analytics';
import { pingEngineHealth } from '@/lib/trading-engine-client';

function startOfUtcDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

export async function getDashboardData(supabase: SupabaseClient, userId: string) {
  const [accountsRes, positionsRes, signalsRes, todayStatsRes, weekStatsRes, monthStatsRes, recentTradesRes, tradingStateRes] =
    await Promise.all([
      supabase
        .from('mt5_accounts')
        .select('id, nickname, account_type, connection_status, trading_enabled, balance, equity, floating_pl, currency, ea_connections(connected, last_heartbeat_at)'),
      supabase.from('positions').select('id, account_id').eq('status', 'OPEN'),
      supabase
        .from('signals')
        .select('*')
        .in('status', ['WAITING', 'APPROVED'])
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('daily_statistics').select('realized_pl').gte('date', startOfUtcDay(0).slice(0, 10)),
      supabase.from('daily_statistics').select('realized_pl').gte('date', startOfUtcDay(7).slice(0, 10)),
      supabase.from('daily_statistics').select('realized_pl').gte('date', startOfUtcDay(30).slice(0, 10)),
      supabase.from('closed_trades').select('*').gte('close_time', startOfUtcDay(30)).order('close_time', { ascending: true }),
      supabase.from('trading_state').select('*').eq('user_id', userId).single(),
    ]);

  const accounts = accountsRes.data ?? [];
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalEquity = accounts.reduce((s, a) => s + Number(a.equity), 0);
  const totalFloatingPl = accounts.reduce((s, a) => s + Number(a.floating_pl), 0);

  const sum = (rows: { realized_pl: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.realized_pl), 0);

  const metrics = computePerformanceMetrics(recentTradesRes.data ?? []);
  const engineHealth = await pingEngineHealth();

  return {
    accounts,
    connectedAccounts: accounts.filter((a) => a.connection_status === 'CONNECTED').length,
    totalAccounts: accounts.length,
    totalBalance,
    totalEquity,
    totalFloatingPl,
    todayPl: sum(todayStatsRes.data),
    weekPl: sum(weekStatsRes.data),
    monthPl: sum(monthStatsRes.data),
    openTradesCount: positionsRes.data?.length ?? 0,
    signals: signalsRes.data ?? [],
    metrics,
    engineHealth,
    tradingState: tradingStateRes.data,
  };
}
