'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { Mt5AccountSettings } from '@/types/database';

export function AccountSettingsEditor({
  accountId,
  nickname,
  initial,
}: {
  accountId: string;
  nickname: string;
  initial: Mt5AccountSettings;
}) {
  const router = useRouter();
  const [useGlobal, setUseGlobal] = useState(initial.use_global_settings);
  const [symbols, setSymbols] = useState(initial.allowed_symbols.join(', '));
  const [maxTrades, setMaxTrades] = useState(initial.max_trades_override ?? '');
  const [maxLot, setMaxLot] = useState(initial.max_lot_override ?? '');
  const [sessions, setSessions] = useState(initial.sessions_enabled);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/accounts/${accountId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useGlobalSettings: useGlobal,
          allowedSymbols: symbols.split(',').map((s) => s.trim()).filter(Boolean),
          maxTradesOverride: maxTrades === '' ? null : Number(maxTrades),
          maxLotOverride: maxLot === '' ? null : Number(maxLot),
          sessionsEnabled: sessions,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{nickname}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} className="h-4 w-4 accent-accent" />
          Use global strategy &amp; risk settings
        </label>

        {!useGlobal && (
          <p className="text-xs text-muted-foreground">
            Custom risk/strategy assignment for this account can be wired up from the Risk page once you
            create an additional risk profile named for this account.
          </p>
        )}

        <div>
          <Label>Allowed symbols (comma-separated)</Label>
          <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="EURUSD, GBPUSD, XAUUSD" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Max trades override</Label>
            <Input type="number" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Use global" />
          </div>
          <div>
            <Label>Max lot override</Label>
            <Input type="number" step={0.01} value={maxLot} onChange={(e) => setMaxLot(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Use global" />
          </div>
        </div>

        <div>
          <Label>Sessions enabled for this account</Label>
          <div className="flex flex-wrap gap-3">
            {Object.entries(sessions).map(([key, value]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setSessions((s) => ({ ...s, [key]: e.target.checked }))}
                  className="h-4 w-4 accent-accent"
                />
                {key}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
