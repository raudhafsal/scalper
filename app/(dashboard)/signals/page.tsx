import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  WAITING: 'warning',
  APPROVED: 'success',
  EXECUTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'muted',
};

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await getCurrentUser();
  const { status } = await searchParams;
  const supabase = await createServerSupabaseClient();

  let query = supabase.from('signals').select('*, strategies(name)').order('created_at', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  const { data: signals } = await query;

  const statuses = ['WAITING', 'APPROVED', 'EXECUTED', 'REJECTED', 'EXPIRED'];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Signals</h1>
        <div className="flex flex-wrap gap-1.5">
          <a href="/signals">
            <Badge tone={!status ? 'info' : 'muted'}>All</Badge>
          </a>
          {statuses.map((s) => (
            <a key={s} href={`/signals?status=${s}`}>
              <Badge tone={status === s ? STATUS_TONE[s] : 'muted'}>{s}</Badge>
            </a>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signal Feed</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Symbol</th>
                <th className="pb-2 pr-3 font-medium">Direction</th>
                <th className="pb-2 pr-3 font-medium">TF</th>
                <th className="pb-2 pr-3 font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">Entry</th>
                <th className="pb-2 pr-3 font-medium">SL</th>
                <th className="pb-2 pr-3 font-medium">TP</th>
                <th className="pb-2 pr-3 font-medium">R:R</th>
                <th className="pb-2 pr-3 font-medium">Strategy</th>
                <th className="pb-2 pr-3 font-medium">Created</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(signals ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{s.symbol}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={s.direction === 'BUY' ? 'success' : 'danger'}>{s.direction}</Badge>
                  </td>
                  <td className="py-2 pr-3">{s.primary_timeframe}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    <span className={s.score >= s.min_score_required ? 'text-profit' : 'text-muted-foreground'}>{s.score}</span>
                    <span className="text-muted-foreground">/{s.min_score_required}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{s.entry_price}</td>
                  <td className="py-2 pr-3 tabular-nums text-loss">{s.stop_loss}</td>
                  <td className="py-2 pr-3 tabular-nums text-profit">{s.take_profit}</td>
                  <td className="py-2 pr-3 tabular-nums">{Number(s.risk_reward).toFixed(2)}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{(s.strategies as { name?: string } | null)?.name ?? '—'}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{formatRelativeTime(s.created_at)}</td>
                  <td className="py-2">
                    <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
              {(signals ?? []).length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                    No signals yet. Start auto trading (paper mode is a safe way to see signals flow) to
                    generate some.
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
