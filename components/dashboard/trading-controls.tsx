'use client';

import { useState } from 'react';
import { Play, Square, ShieldAlert, XOctagon, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { presentTradingStatus } from '@/lib/trading-status';
import { useRealtimeTable } from '@/hooks/use-realtime-table';
import type { Mt5Account, Profile, RunMode, TradingState } from '@/types/database';
import type { PreflightCheck } from '@/lib/trading/preflight';
import { can } from '@/lib/auth/permissions';

export function TradingControls({
  profile,
  initialTradingState,
  accounts,
  strategyName,
}: {
  profile: Profile;
  initialTradingState: TradingState;
  accounts: Pick<Mt5Account, 'id' | 'nickname' | 'account_type' | 'trading_enabled'>[];
  strategyName: string;
}) {
  const [tradingState, setTradingState] = useState(initialTradingState);
  const [modal, setModal] = useState<'start' | 'stop' | 'emergency' | 'closeAll' | null>(null);

  useRealtimeTable<TradingState>(
    'trading_state',
    (payload) => {
      if (payload.new && 'status' in payload.new) setTradingState(payload.new as TradingState);
    },
    `user_id=eq.${profile.id}`,
  );

  const status = presentTradingStatus(tradingState.status, tradingState.mode);
  const canControl = can(profile.role, 'trading:start');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto Trading Status</CardTitle>
        <Badge tone={status.tone}>
          <StatusDot tone={status.tone} pulse={status.pulse} />
          {status.emoji} {status.label}
        </Badge>
      </CardHeader>
      <CardContent>
        {!canControl ? (
          <p className="text-sm text-muted-foreground">
            Your role ({profile.role}) has read-only access. Ask an admin or trader to change trading
            state.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              disabled={tradingState.status === 'ACTIVE'}
              onClick={() => setModal('start')}
            >
              <Play className="h-4 w-4" /> Start Auto Trading
            </Button>
            <Button
              variant="outline"
              disabled={tradingState.status === 'STOP_NEW_TRADES' || tradingState.status === 'STOPPED'}
              onClick={() => setModal('stop')}
            >
              <Square className="h-4 w-4" /> Stop New Trades
            </Button>
            <Button variant="danger" onClick={() => setModal('emergency')}>
              <ShieldAlert className="h-4 w-4" /> Emergency Stop All
            </Button>
            <Button variant="outline" className="border-danger/50 text-danger hover:bg-danger/10" onClick={() => setModal('closeAll')}>
              <XOctagon className="h-4 w-4" /> Close All Positions
            </Button>
          </div>
        )}

        {tradingState.status === 'EMERGENCY_STOPPED' && tradingState.emergency_stop_reason && (
          <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Emergency stop reason: {tradingState.emergency_stop_reason}
          </p>
        )}
      </CardContent>

      {modal === 'start' && (
        <StartTradingModal
          accounts={accounts}
          strategyName={strategyName}
          onClose={() => setModal(null)}
          onDone={(next) => {
            setTradingState(next);
            setModal(null);
          }}
        />
      )}
      {modal === 'stop' && (
        <StopTradesModal onClose={() => setModal(null)} onDone={(next) => { setTradingState(next); setModal(null); }} />
      )}
      {modal === 'emergency' && (
        <EmergencyStopModal onClose={() => setModal(null)} onDone={(next) => { setTradingState(next); setModal(null); }} />
      )}
      {modal === 'closeAll' && (
        <CloseAllModal accounts={accounts} onClose={() => setModal(null)} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// START AUTO TRADING
// ---------------------------------------------------------------------------
function StartTradingModal({
  accounts,
  strategyName,
  onClose,
  onDone,
}: {
  accounts: Pick<Mt5Account, 'id' | 'nickname' | 'account_type' | 'trading_enabled'>[];
  strategyName: string;
  onClose: () => void;
  onDone: (state: TradingState) => void;
}) {
  const [mode, setMode] = useState<RunMode>('PAPER');
  const [selected, setSelected] = useState<string[]>(accounts.filter((a) => a.trading_enabled).map((a) => a.id));
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trading/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, accountIds: selected, confirmedRiskAcknowledgement: ack }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChecks(data.checks ?? null);
        setError(data.error ?? 'Failed to start');
        return;
      }
      onDone(data.tradingState);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Start Auto Trading" description={`Strategy: ${strategyName}`}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="mode">Mode</Label>
          <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as RunMode)}>
            <option value="PAPER">PAPER (simulated, no orders sent)</option>
            <option value="DEMO">DEMO (real orders on demo accounts)</option>
            <option value="LIVE">LIVE (real orders, real money)</option>
          </Select>
          {mode === 'LIVE' && (
            <p className="mt-1 text-xs text-danger">
              LIVE mode sends real orders with real money. Double-check risk settings first.
            </p>
          )}
        </div>

        <div>
          <Label>Accounts ({selected.length} selected)</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                  }
                  className="h-4 w-4 accent-accent"
                />
                {a.nickname} <Badge tone="muted">{a.account_type}</Badge>
              </label>
            ))}
            {accounts.length === 0 && <p className="text-xs text-muted-foreground">No accounts yet.</p>}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
          I understand the system will apply live risk management per account and that no strategy
          guarantees profit.
        </label>

        {checks && (
          <ul className="space-y-1 rounded-md border border-border p-2 text-xs">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2">
                {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-profit" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
                <span className={c.passed ? 'text-foreground' : 'text-danger'}>{c.label}</span>
                {c.detail && <span className="text-muted-foreground">- {c.detail}</span>}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" disabled={!ack || selected.length === 0 || loading} onClick={submit}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Run checks & start
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// STOP NEW TRADES
// ---------------------------------------------------------------------------
function StopTradesModal({ onClose, onDone }: { onClose: () => void; onDone: (state: TradingState) => void }) {
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/trading/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) onDone(data.tradingState);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Stop New Trades"
      description="No new entries will be generated. Existing open positions keep being managed (breakeven, partial TP, trailing, SL/TP) per their configured rules."
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="warning" disabled={loading} onClick={submit}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm
        </Button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EMERGENCY STOP ALL
// ---------------------------------------------------------------------------
function EmergencyStopModal({ onClose, onDone }: { onClose: () => void; onDone: (state: TradingState) => void }) {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trading/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, confirmationPhrase: phrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }
      onDone(data.tradingState);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Emergency Stop All"
      description="Stops all new signals and trade commands immediately, notifies every connected EA, and locks the system into an emergency-stopped state until manually cleared."
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. unexpected losses, broker issue" />
        </div>
        <div>
          <Label htmlFor="phrase">
            Type <span className="font-mono font-semibold">EMERGENCY STOP</span> to confirm
          </Label>
          <Input id="phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </div>
        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={phrase !== 'EMERGENCY STOP' || reason.trim().length < 3 || loading} onClick={submit}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Emergency Stop All
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CLOSE ALL POSITIONS (separate from Emergency Stop, per spec section 35)
// ---------------------------------------------------------------------------
function CloseAllModal({
  accounts,
  onClose,
}: {
  accounts: Pick<Mt5Account, 'id' | 'nickname'>[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(accounts.map((a) => a.id));
  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ queued: number; byAccount: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trading/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: selected, confirmationPhrase: phrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Close All Positions"
      description="Queues a CLOSE command for every currently open position on the selected accounts. This does not change the auto-trading state."
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{result.queued} close command(s) queued.</p>
          <ul className="text-xs text-muted-foreground">
            {Object.entries(result.byAccount).map(([accountId, count]) => {
              const acc = accounts.find((a) => a.id === accountId);
              return (
                <li key={accountId}>
                  {acc?.nickname ?? accountId}: {count} position(s)
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                  }
                  className="h-4 w-4 accent-accent"
                />
                {a.nickname}
              </label>
            ))}
          </div>
          <div>
            <Label htmlFor="close-phrase">
              Type <span className="font-mono font-semibold">CLOSE ALL POSITIONS</span> to confirm
            </Label>
            <Input id="close-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
          </div>
          {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={phrase !== 'CLOSE ALL POSITIONS' || selected.length === 0 || loading}
              onClick={submit}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Close All Positions
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
