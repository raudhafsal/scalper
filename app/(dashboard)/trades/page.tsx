import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatSignedCurrency } from '@/lib/utils';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; symbol?: string; direction?: string; result?: string }>;
}) {
  await getCurrentUser();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const [{ data: accounts }, tradesRes] = await Promise.all([
    supabase.from('mt5_accounts').select('id, nickname'),
    (async () => {
      let query = supabase
        .from('closed_trades')
        .select('*, mt5_accounts(nickname), strategies(name)')
        .order('close_time', { ascending: false })
        .limit(200);
      if (params.accountId) query = query.eq('account_id', params.accountId);
      if (params.symbol) query = query.eq('symbol', params.symbol.toUpperCase());
      if (params.direction) query = query.eq('direction', params.direction);
      if (params.result) query = query.eq('result', params.result);
      return query;
    })(),
  ]);

  const trades = tradesRes.data ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">Trades</h1>

      <form className="flex flex-wrap gap-2" action="/trades">
        <select name="accountId" defaultValue={params.accountId ?? ''} className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm">
          <option value="">All accounts</option>
          {(accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.nickname}
            </option>
          ))}
        </select>
        <select name="direction" defaultValue={params.direction ?? ''} className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm">
          <option value="">Any direction</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <select name="result" defaultValue={params.result ?? ''} className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm">
          <option value="">Any result</option>
          <option value="WIN">Win</option>
          <option value="LOSS">Loss</option>
          <option value="BREAKEVEN">Breakeven</option>
        </select>
        <input
          name="symbol"
          defaultValue={params.symbol ?? ''}
          placeholder="Symbol"
          className="h-9 w-28 rounded-md border border-border bg-surface-2 px-2 text-sm"
        />
        <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground">
          Filter
        </button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Trade History ({trades.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Account</th>
                <th className="pb-2 pr-3 font-medium">Symbol</th>
                <th className="pb-2 pr-3 font-medium">Dir</th>
                <th className="pb-2 pr-3 font-medium">Lot</th>
                <th className="pb-2 pr-3 font-medium">Entry</th>
                <th className="pb-2 pr-3 font-medium">Exit</th>
                <th className="pb-2 pr-3 font-medium">Profit</th>
                <th className="pb-2 pr-3 font-medium">Comm.</th>
                <th className="pb-2 pr-3 font-medium">Swap</th>
                <th className="pb-2 pr-3 font-medium">Strategy</th>
                <th className="pb-2 pr-3 font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">Duration</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 text-foreground">{(t.mt5_accounts as { nickname?: string } | null)?.nickname ?? '—'}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{t.symbol}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={t.direction === 'BUY' ? 'success' : 'danger'}>{t.direction}</Badge>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{t.volume}</td>
                  <td className="py-2 pr-3 tabular-nums">{t.entry_price}</td>
                  <td className="py-2 pr-3 tabular-nums">{t.exit_price}</td>
                  <td className={`py-2 pr-3 tabular-nums ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {formatSignedCurrency(t.profit)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{formatCurrency(t.commission)}</td>
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{formatCurrency(t.swap)}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{(t.strategies as { name?: string } | null)?.name ?? '—'}</td>
                  <td className="py-2 pr-3 tabular-nums">{t.signal_score ?? '—'}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatDuration(t.duration_seconds)}</td>
                  <td className="py-2">
                    <Badge tone={t.result === 'WIN' ? 'success' : t.result === 'LOSS' ? 'danger' : 'muted'}>{t.result}</Badge>
                  </td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-sm text-muted-foreground">
                    No closed trades yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
