import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { computePerformanceMetrics, sessionForTimestamp } from '@/lib/analytics';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityChart } from '@/components/analytics/equity-chart';
import { BreakdownChart } from '@/components/analytics/breakdown-chart';
import { formatPct, formatSignedCurrency } from '@/lib/utils';

export default async function AnalyticsPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const [{ data: trades }, { data: accounts }] = await Promise.all([
    supabase
      .from('closed_trades')
      .select('*, mt5_accounts(nickname), strategies(name)')
      .gte('close_time', since.toISOString())
      .order('close_time', { ascending: true }),
    supabase.from('mt5_accounts').select('id, nickname').eq('user_id', profile.id),
  ]);

  const rows = trades ?? [];
  const metrics = computePerformanceMetrics(rows);

  let running = 0;
  const equityCurve = rows.map((t) => {
    running += t.profit;
    return { date: new Date(t.close_time).toLocaleDateString(), equity: Number(running.toFixed(2)), balance: Number(running.toFixed(2)) };
  });

  function groupBy<K extends string>(getKey: (t: (typeof rows)[number]) => K) {
    const groups = new Map<K, typeof rows>();
    for (const t of rows) {
      const key = getKey(t);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return Array.from(groups.entries()).map(([name, items]) => ({
      name,
      netProfit: Number(items.reduce((s, t) => s + t.profit, 0).toFixed(2)),
    }));
  }

  const byAccount = groupBy((t) => (t.mt5_accounts as { nickname?: string } | null)?.nickname ?? 'Unknown');
  const bySymbol = groupBy((t) => t.symbol);
  const bySession = groupBy((t) => sessionForTimestamp(t.open_time).replace(/_/g, ' '));
  const byStrategy = groupBy((t) => (t.strategies as { name?: string } | null)?.name ?? 'Unknown');

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
        <p className="text-xs text-muted-foreground">
          Historical performance, computed from {rows.length} closed trade(s) across {(accounts ?? []).length} account(s) &middot; last
          90 days
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Net Profit" value={formatSignedCurrency(metrics.netProfit)} tone={metrics.netProfit >= 0 ? 'profit' : 'loss'} />
        <StatCard label="Win Rate" value={metrics.winRate !== null ? formatPct(metrics.winRate) : '—'} />
        <StatCard
          label="Profit Factor"
          value={metrics.profitFactor === null ? '—' : metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
        />
        <StatCard label="Avg Win" value={formatSignedCurrency(metrics.avgWin)} tone="profit" />
        <StatCard label="Avg Loss" value={formatSignedCurrency(metrics.avgLoss)} tone="loss" />
        <StatCard label="Max Drawdown" value={formatPct(metrics.maxDrawdownPct)} tone="warning" />
        <StatCard label="Max Consecutive Losses" value={String(metrics.maxConsecutiveLosses)} />
        <StatCard label="Avg Trade Duration" value={`${Math.round(metrics.avgTradeDurationSeconds / 60)}m`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equity Curve (cumulative P/L)</CardTitle>
        </CardHeader>
        <CardContent>
          <EquityChart data={equityCurve} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance by Account</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={byAccount} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by Symbol</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={bySymbol} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by Session</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={bySession} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownChart data={byStrategy} />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        All figures above are computed directly from recorded closed trades. Nothing here is projected,
        estimated, or guaranteed - past performance does not indicate future results.
      </p>
    </div>
  );
}
