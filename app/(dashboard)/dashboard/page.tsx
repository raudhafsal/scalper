import Link from 'next/link';
import { Wallet, TrendingUp, Activity, Percent, Target, ArrowLeftRight, Radio, Server } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDashboardData } from '@/lib/dashboard-data';
import { StatCard } from '@/components/dashboard/stat-card';
import { TradingControls } from '@/components/dashboard/trading-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, StatusDot } from '@/components/ui/badge';
import { formatCurrency, formatPct, formatRelativeTime, formatSignedCurrency } from '@/lib/utils';

export default async function DashboardPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const [{ data: strategy }, data] = await Promise.all([
    supabase.from('strategies').select('name').eq('user_id', profile.id).eq('is_active', true).single(),
    getDashboardData(supabase, profile.id),
  ]);

  const plTone = (v: number): 'profit' | 'loss' | 'default' => (v > 0 ? 'profit' : v < 0 ? 'loss' : 'default');

  return (
    <div className="space-y-6 p-4 md:p-6">
      <TradingControls
        profile={profile}
        initialTradingState={data.tradingState!}
        accounts={data.accounts}
        strategyName={strategy?.name ?? 'Multi-Confirmation Scalping'}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total Balance" value={formatCurrency(data.totalBalance)} icon={Wallet} />
        <StatCard label="Total Equity" value={formatCurrency(data.totalEquity)} icon={Wallet} />
        <StatCard
          label="Floating P/L"
          value={formatSignedCurrency(data.totalFloatingPl)}
          tone={plTone(data.totalFloatingPl)}
          icon={TrendingUp}
        />
        <StatCard label="Today's P/L" value={formatSignedCurrency(data.todayPl)} tone={plTone(data.todayPl)} />
        <StatCard label="Weekly P/L" value={formatSignedCurrency(data.weekPl)} tone={plTone(data.weekPl)} />
        <StatCard label="Monthly P/L" value={formatSignedCurrency(data.monthPl)} tone={plTone(data.monthPl)} />
        <StatCard
          label="Current Drawdown"
          value={formatPct(data.metrics.maxDrawdownPct)}
          tone={data.metrics.maxDrawdownPct > 5 ? 'warning' : 'default'}
          icon={Activity}
          sub="trailing 30 days"
        />
        <StatCard
          label="Win Rate"
          value={data.metrics.winRate !== null ? formatPct(data.metrics.winRate) : '—'}
          icon={Percent}
          sub={`${data.metrics.wins}W / ${data.metrics.losses}L`}
        />
        <StatCard
          label="Profit Factor"
          value={
            data.metrics.profitFactor === null
              ? '—'
              : data.metrics.profitFactor === Infinity
                ? '∞'
                : data.metrics.profitFactor.toFixed(2)
          }
          icon={Target}
        />
        <StatCard label="Open Trades" value={String(data.openTradesCount)} icon={ArrowLeftRight} />
        <StatCard
          label="Connected Accounts"
          value={`${data.connectedAccounts} / ${data.totalAccounts}`}
          icon={Wallet}
        />
        <StatCard label="Active Signals" value={String(data.signals.length)} icon={Radio} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Signals</CardTitle>
            <Link href="/signals" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.signals.length === 0 && <p className="text-sm text-muted-foreground">No active signals.</p>}
            {data.signals.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">{s.symbol}</span>{' '}
                  <Badge tone={s.direction === 'BUY' ? 'success' : 'danger'}>{s.direction}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Score {s.score}</span>
                  <Badge tone={s.status === 'APPROVED' ? 'success' : 'muted'}>{s.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <Link href="/system" className="text-xs text-accent hover:underline">
              Details
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <HealthRow label="Web App" ok />
            <HealthRow label="Supabase" ok />
            <HealthRow
              label="Trading Engine"
              ok={data.engineHealth.reachable && data.engineHealth.status !== 'UNHEALTHY'}
              detail={data.engineHealth.reachable ? `${data.engineHealth.latencyMs}ms` : data.engineHealth.error}
            />
            <HealthRow label="Market Data" ok={!!data.engineHealth.marketDataOk} />
            <HealthRow
              label="MT5 Bridge"
              ok={data.connectedAccounts === data.totalAccounts && data.totalAccounts > 0}
              detail={`${data.connectedAccounts}/${data.totalAccounts} connected`}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected MT5 Accounts</CardTitle>
          <Link href="/accounts" className="text-xs text-accent hover:underline">
            Manage
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Balance</th>
                <th className="pb-2 font-medium">Equity</th>
                <th className="pb-2 font-medium">Floating P/L</th>
                <th className="pb-2 font-medium">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => {
                const ea = Array.isArray(a.ea_connections) ? a.ea_connections[0] : a.ea_connections;
                return (
                  <tr key={a.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium text-foreground">{a.nickname}</td>
                    <td className="py-2">
                      <Badge tone={a.account_type === 'LIVE' ? 'danger' : 'muted'}>{a.account_type}</Badge>
                    </td>
                    <td className="py-2">
                      <ConnectionBadge status={a.connection_status} />
                    </td>
                    <td className="py-2 tabular-nums">{formatCurrency(Number(a.balance), a.currency)}</td>
                    <td className="py-2 tabular-nums">{formatCurrency(Number(a.equity), a.currency)}</td>
                    <td className={`py-2 tabular-nums ${Number(a.floating_pl) >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {formatSignedCurrency(Number(a.floating_pl), a.currency)}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{formatRelativeTime(ea?.last_heartbeat_at ?? null)}</td>
                  </tr>
                );
              })}
              {data.accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    No MT5 accounts yet.{' '}
                    <Link href="/accounts" className="text-accent hover:underline">
                      Add one
                    </Link>
                    .
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

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-foreground">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {detail}
        <StatusDot tone={ok ? 'success' : 'danger'} pulse={ok} />
      </span>
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'success' | 'warning' | 'danger' | 'muted'; emoji: string }> = {
    CONNECTED: { tone: 'success', emoji: '🟢' },
    CONNECTING: { tone: 'warning', emoji: '🟡' },
    OFFLINE: { tone: 'danger', emoji: '🔴' },
    DISABLED: { tone: 'muted', emoji: '⚪' },
    RISK_LOCKED: { tone: 'danger', emoji: '🔒' },
  };
  const cfg = map[status] ?? map.OFFLINE!;
  return (
    <Badge tone={cfg.tone}>
      {cfg.emoji} {status.replace('_', ' ')}
    </Badge>
  );
}
