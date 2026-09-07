'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import type { RiskSettings } from '@/types/database';

const FIELDS: { key: keyof RiskSettings; label: string; step?: number; suffix?: string }[] = [
  { key: 'risk_per_trade_pct', label: 'Risk per trade', step: 0.05, suffix: '%' },
  { key: 'max_daily_loss_pct', label: 'Max daily loss', step: 0.5, suffix: '%' },
  { key: 'max_drawdown_pct', label: 'Max drawdown', step: 0.5, suffix: '%' },
  { key: 'max_simultaneous_trades', label: 'Max simultaneous trades' },
  { key: 'max_trades_per_symbol', label: 'Max trades per symbol' },
  { key: 'max_trades_per_day', label: 'Max trades per day' },
  { key: 'max_trades_per_hour', label: 'Max trades per hour' },
  { key: 'max_consecutive_losses', label: 'Max consecutive losses' },
  { key: 'cooldown_after_loss_minutes', label: 'Cooldown after loss', suffix: 'min' },
  { key: 'cooldown_after_trade_minutes', label: 'Cooldown after trade', suffix: 'min' },
  { key: 'max_spread_points', label: 'Max spread', suffix: 'points' },
  { key: 'max_lot', label: 'Max lot', step: 0.01 },
  { key: 'min_equity', label: 'Minimum equity', suffix: '$' },
];

export function RiskForm({ initial }: { initial: RiskSettings }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/risk?id=${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskPerTradePct: Number(form.risk_per_trade_pct),
          maxDailyLossPct: Number(form.max_daily_loss_pct),
          maxDrawdownPct: Number(form.max_drawdown_pct),
          maxSimultaneousTrades: Number(form.max_simultaneous_trades),
          maxTradesPerSymbol: Number(form.max_trades_per_symbol),
          maxTradesPerDay: Number(form.max_trades_per_day),
          maxTradesPerHour: Number(form.max_trades_per_hour),
          maxConsecutiveLosses: Number(form.max_consecutive_losses),
          cooldownAfterLossMinutes: Number(form.cooldown_after_loss_minutes),
          cooldownAfterTradeMinutes: Number(form.cooldown_after_trade_minutes),
          maxSpreadPoints: Number(form.max_spread_points),
          maxLot: Number(form.max_lot),
          minEquity: Number(form.min_equity),
          dailyProfitLockPct: form.daily_profit_lock_pct ? Number(form.daily_profit_lock_pct) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Profile: {form.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>
                {f.label} {f.suffix && <span className="text-muted-foreground">({f.suffix})</span>}
              </Label>
              <Input
                type="number"
                step={f.step ?? 1}
                value={form[f.key] as number}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, [f.key]: Number(e.target.value) }));
                  setSaved(false);
                }}
              />
            </div>
          ))}
          <div>
            <Label>Daily profit lock (%, optional)</Label>
            <Input
              type="number"
              step={0.5}
              value={form.daily_profit_lock_pct ?? ''}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, daily_profit_lock_pct: e.target.value ? Number(e.target.value) : null }));
                setSaved(false);
              }}
              placeholder="Disabled"
            />
          </div>
        </div>

        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          Position sizing always uses each account&rsquo;s real MT5 symbol specification (tick size, tick
          value, contract size, min/max/step lot, and SL distance) reported by the EA - never a hard-coded
          pip value. See docs/RISK_MANAGEMENT.md.
        </p>

        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-profit">Saved</span>}
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save risk settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
