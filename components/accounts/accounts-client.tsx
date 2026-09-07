'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddAccountDialog } from '@/components/accounts/add-account-dialog';
import { formatCurrency, formatRelativeTime, formatSignedCurrency } from '@/lib/utils';
import { can } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/database';

interface AccountRow {
  id: string;
  nickname: string;
  login_id: string;
  broker: string;
  server: string;
  account_type: 'DEMO' | 'LIVE';
  connection_status: string;
  trading_enabled: boolean;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  floating_pl: number;
  currency: string;
  ea_connections: { connected: boolean; last_heartbeat_at: string | null; last_sync_at: string | null; ea_version: string | null; last_error: string | null } | { connected: boolean; last_heartbeat_at: string | null; last_sync_at: string | null; ea_version: string | null; last_error: string | null }[] | null;
}

const STATUS_MAP: Record<string, { tone: 'success' | 'warning' | 'danger' | 'muted'; emoji: string }> = {
  CONNECTED: { tone: 'success', emoji: '🟢' },
  CONNECTING: { tone: 'warning', emoji: '🟡' },
  OFFLINE: { tone: 'danger', emoji: '🔴' },
  DISABLED: { tone: 'muted', emoji: '⚪' },
  RISK_LOCKED: { tone: 'danger', emoji: '🔒' },
};

export function AccountsClient({ accounts, role }: { accounts: AccountRow[]; role: UserRole }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const canWrite = can(role, 'accounts:write');

  async function toggleTrading(id: string, next: boolean) {
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradingEnabled: next }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">MT5 Accounts</h1>
        {canWrite && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add MT5 Account
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => {
          const ea = Array.isArray(a.ea_connections) ? a.ea_connections[0] : a.ea_connections;
          const status = STATUS_MAP[a.connection_status] ?? STATUS_MAP.OFFLINE!;
          return (
            <Card key={a.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{a.nickname}</h3>
                      <Badge tone={a.account_type === 'LIVE' ? 'danger' : 'muted'}>{a.account_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      #{a.login_id} &middot; {a.broker} &middot; {a.server}
                    </p>
                  </div>
                  <Badge tone={status.tone}>
                    {status.emoji} {a.connection_status.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric label="Balance" value={formatCurrency(Number(a.balance), a.currency)} />
                  <Metric label="Equity" value={formatCurrency(Number(a.equity), a.currency)} />
                  <Metric label="Margin" value={formatCurrency(Number(a.margin), a.currency)} />
                  <Metric label="Free Margin" value={formatCurrency(Number(a.free_margin), a.currency)} />
                  <Metric
                    label="Floating P/L"
                    value={formatSignedCurrency(Number(a.floating_pl), a.currency)}
                    tone={Number(a.floating_pl) >= 0 ? 'profit' : 'loss'}
                  />
                  <Metric label="EA" value={ea?.ea_version ?? '—'} />
                </div>

                <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {ea?.connected ? <Wifi className="h-3.5 w-3.5 text-profit" /> : <WifiOff className="h-3.5 w-3.5 text-danger" />}
                    Last heartbeat: {formatRelativeTime(ea?.last_heartbeat_at ?? null)}
                  </span>
                  {canWrite && (
                    <label className="flex items-center gap-1.5">
                      Trading
                      <input
                        type="checkbox"
                        checked={a.trading_enabled}
                        onChange={(e) => toggleTrading(a.id, e.target.checked)}
                        className="h-4 w-4 accent-accent"
                      />
                    </label>
                  )}
                </div>
                {ea?.last_error && (
                  <p className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-xs text-danger">{ea.last_error}</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {accounts.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            No MT5 accounts yet. Add one to get started.
          </p>
        )}
      </div>

      {showAdd && <AddAccountDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}
