import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { pingEngineHealth } from '@/lib/trading-engine-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, StatusDot } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils';
import type { SystemComponent } from '@/types/database';

const COMPONENTS: { key: SystemComponent; label: string }[] = [
  { key: 'WEB_APP', label: 'Web App' },
  { key: 'SUPABASE', label: 'Supabase' },
  { key: 'TRADING_ENGINE', label: 'Trading Engine' },
  { key: 'MARKET_DATA', label: 'Market Data' },
  { key: 'MT5_BRIDGE', label: 'MT5 Bridge' },
];

export default async function SystemHealthPage() {
  await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recentEvents }, engineHealth, { data: accounts }] = await Promise.all([
    supabase.from('system_events').select('*').gte('created_at', since24h).order('created_at', { ascending: false }),
    pingEngineHealth(),
    supabase.from('mt5_accounts').select('connection_status, ea_connections(connected)'),
  ]);

  const events = recentEvents ?? [];
  const connectedCount = (accounts ?? []).filter((a) => a.connection_status === 'CONNECTED').length;

  function componentInfo(key: SystemComponent) {
    const compEvents = events.filter((e) => e.component === key);
    const errorCount = compEvents.filter((e) => e.severity === 'ERROR' || e.severity === 'CRITICAL').length;
    const lastEvent = compEvents[0];

    let ok = true;
    let latency: string | undefined;
    let lastHeartbeat: string | null = null;

    if (key === 'TRADING_ENGINE') {
      ok = engineHealth.reachable && engineHealth.status !== 'UNHEALTHY';
      latency = engineHealth.reachable ? `${engineHealth.latencyMs}ms` : undefined;
      lastHeartbeat = engineHealth.lastHeartbeatAt ?? null;
    } else if (key === 'MARKET_DATA') {
      ok = !!engineHealth.marketDataOk;
    } else if (key === 'MT5_BRIDGE') {
      ok = (accounts ?? []).length === 0 || connectedCount === (accounts ?? []).length;
    }

    return { ok, latency, lastHeartbeat, lastEvent, errorCount };
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">System Health</h1>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COMPONENTS.map(({ key, label }) => {
          const info = componentInfo(key);
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
                <Badge tone={info.ok ? 'success' : 'danger'}>
                  <StatusDot tone={info.ok ? 'success' : 'danger'} pulse={info.ok} />
                  {info.ok ? 'Healthy' : 'Degraded'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {info.latency && <div>Latency: {info.latency}</div>}
                {info.lastHeartbeat && <div>Last heartbeat: {formatRelativeTime(info.lastHeartbeat)}</div>}
                <div>Last event: {info.lastEvent ? `${info.lastEvent.message} (${formatRelativeTime(info.lastEvent.created_at)})` : 'none in 24h'}</div>
                <div>
                  Errors (24h):{' '}
                  <span className={info.errorCount > 0 ? 'text-danger' : 'text-foreground'}>{info.errorCount}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent System Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {events.slice(0, 50).map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <SeverityDot severity={e.severity} />
                <span className="text-foreground">{e.message}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(e.created_at)}</span>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-muted-foreground">No events in the last 24 hours.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const tone = severity === 'CRITICAL' || severity === 'ERROR' ? 'danger' : severity === 'WARNING' ? 'warning' : 'info';
  return <StatusDot tone={tone as 'danger' | 'warning' | 'info'} />;
}
