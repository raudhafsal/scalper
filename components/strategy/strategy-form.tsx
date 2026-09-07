'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import type { StrategySettings } from '@/types/database';

const WEIGHT_LABELS: Record<string, string> = {
  marketStructure: 'Market Structure',
  liquiditySweep: 'Liquidity Sweep',
  bosChoch: 'BOS / CHoCH',
  orderBlock: 'Order Block',
  fvg: 'Fair Value Gap',
  ema: 'EMA',
  rsi: 'RSI',
  atr: 'ATR',
  candleConfirmation: 'Candle Confirmation',
};

export function StrategyForm({ initial }: { initial: StrategySettings }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const weightSum = Object.values(form.score_weights).reduce((a, b) => a + Number(b), 0);

  function set<K extends keyof StrategySettings>(key: K, value: StrategySettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function setWeight(key: string, value: number) {
    setForm((f) => ({ ...f, score_weights: { ...f.score_weights, [key]: value } }));
    setSaved(false);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryTimeframe: form.primary_timeframe,
          confirmationTimeframe: form.confirmation_timeframe,
          optionalTimeframe: form.optional_timeframe,
          minSignalScore: Number(form.min_signal_score),
          scoreWeights: form.score_weights,
          structureLookback: Number(form.structure_lookback),
          liquidityLookback: Number(form.liquidity_lookback),
          emaFast: Number(form.ema_fast),
          emaMid: Number(form.ema_mid),
          emaSlow: Number(form.ema_slow),
          emaTrend: Number(form.ema_trend),
          rsiPeriod: Number(form.rsi_period),
          atrPeriod: Number(form.atr_period),
          slMethod: form.sl_method,
          atrSlMultiplier: Number(form.atr_sl_multiplier),
          tpMode: form.tp_mode,
          customRr: form.custom_rr ? Number(form.custom_rr) : null,
          breakevenEnabled: form.breakeven_enabled,
          breakevenAtR: Number(form.breakeven_at_r),
          partialTpEnabled: form.partial_tp_enabled,
          partialTpAtR: Number(form.partial_tp_at_r),
          partialTpPct: Number(form.partial_tp_pct),
          trailingEnabled: form.trailing_enabled,
          sessionFilters: form.session_filters,
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Timeframes & Signal Threshold</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Primary timeframe</Label>
            <Select value={form.primary_timeframe} onChange={(e) => set('primary_timeframe', e.target.value)}>
              <option value="M1">M1</option>
              <option value="M5">M5</option>
              <option value="M15">M15</option>
            </Select>
          </div>
          <div>
            <Label>Confirmation timeframe</Label>
            <Select value={form.confirmation_timeframe} onChange={(e) => set('confirmation_timeframe', e.target.value)}>
              <option value="M1">M1</option>
              <option value="M5">M5</option>
              <option value="M15">M15</option>
            </Select>
          </div>
          <div>
            <Label>Minimum signal score</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.min_signal_score}
              onChange={(e) => set('min_signal_score', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signal Score Weights (must sum to 100)</CardTitle>
          <span className={weightSum === 100 ? 'text-xs text-profit' : 'text-xs text-danger'}>Sum: {weightSum}</span>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {Object.entries(form.score_weights).map(([key, value]) => (
            <div key={key}>
              <Label>{WEIGHT_LABELS[key] ?? key}</Label>
              <Input type="number" min={0} max={100} value={value} onChange={(e) => setWeight(key, Number(e.target.value))} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indicators & Lookback</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <NumField label="Structure lookback" value={form.structure_lookback} onChange={(v) => set('structure_lookback', v)} />
          <NumField label="Liquidity lookback" value={form.liquidity_lookback} onChange={(v) => set('liquidity_lookback', v)} />
          <NumField label="EMA fast" value={form.ema_fast} onChange={(v) => set('ema_fast', v)} />
          <NumField label="EMA mid" value={form.ema_mid} onChange={(v) => set('ema_mid', v)} />
          <NumField label="EMA slow" value={form.ema_slow} onChange={(v) => set('ema_slow', v)} />
          <NumField label="EMA trend" value={form.ema_trend} onChange={(v) => set('ema_trend', v)} />
          <NumField label="RSI period" value={form.rsi_period} onChange={(v) => set('rsi_period', v)} />
          <NumField label="ATR period" value={form.atr_period} onChange={(v) => set('atr_period', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stop Loss / Take Profit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>SL method</Label>
            <Select value={form.sl_method} onChange={(e) => set('sl_method', e.target.value as StrategySettings['sl_method'])}>
              <option value="SWING">Swing-based</option>
              <option value="ATR">ATR-based</option>
              <option value="ORDER_BLOCK">Order-block invalidation</option>
            </Select>
          </div>
          {form.sl_method === 'ATR' && (
            <NumField label="ATR SL multiplier" value={form.atr_sl_multiplier} onChange={(v) => set('atr_sl_multiplier', v)} step={0.1} />
          )}
          <div>
            <Label>TP mode</Label>
            <Select value={form.tp_mode} onChange={(e) => set('tp_mode', e.target.value as StrategySettings['tp_mode'])}>
              <option value="RR_1_1">1:1</option>
              <option value="RR_1_1_5">1:1.5</option>
              <option value="RR_1_2">1:2 (default)</option>
              <option value="RR_1_3">1:3</option>
              <option value="CUSTOM">Custom</option>
            </Select>
          </div>
          {form.tp_mode === 'CUSTOM' && (
            <NumField label="Custom R:R" value={form.custom_rr ?? 2} onChange={(v) => set('custom_rr', v)} step={0.1} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trade Management</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <ToggleField label="Breakeven" checked={form.breakeven_enabled} onChange={(v) => set('breakeven_enabled', v)} />
          {form.breakeven_enabled && <NumField label="Breakeven at R" value={form.breakeven_at_r} onChange={(v) => set('breakeven_at_r', v)} step={0.1} />}
          <ToggleField label="Partial TP" checked={form.partial_tp_enabled} onChange={(v) => set('partial_tp_enabled', v)} />
          {form.partial_tp_enabled && (
            <>
              <NumField label="Partial TP at R" value={form.partial_tp_at_r} onChange={(v) => set('partial_tp_at_r', v)} step={0.1} />
              <NumField label="Partial TP %" value={form.partial_tp_pct} onChange={(v) => set('partial_tp_pct', v)} />
            </>
          )}
          <ToggleField label="Trailing stop" checked={form.trailing_enabled} onChange={(v) => set('trailing_enabled', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trading Sessions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {Object.entries(form.session_filters).map(([key, value]) => (
            <ToggleField
              key={key}
              label={key === 'newyork' ? 'New York' : key === 'overlap' ? 'London/NY Overlap' : key.charAt(0).toUpperCase() + key.slice(1)}
              checked={value}
              onChange={(v) => set('session_filters', { ...form.session_filters, [key]: v })}
            />
          ))}
        </CardContent>
      </Card>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-profit">Saved</span>}
        <Button onClick={submit} disabled={saving || weightSum !== 100}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save strategy settings
        </Button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );
}
