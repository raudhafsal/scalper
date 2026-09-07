'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';

export function AddAccountDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [loginId, setLoginId] = useState('');
  const [broker, setBroker] = useState('');
  const [server, setServer] = useState('');
  const [accountType, setAccountType] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, loginId, broker, server, accountType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create account');
        return;
      }
      setBridgeToken(data.bridgeToken);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function finish() {
    onClose();
    router.refresh();
  }

  if (bridgeToken) {
    return (
      <Dialog open onClose={finish} title="Account created" description="Copy the bridge token now - it will not be shown again.">
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Paste this into the MT5_Scalp_Bridge EA&rsquo;s <code>BridgeToken</code> input parameter on the MT5
            terminal for this account. This is not your broker password and is never sent anywhere except
            the trading engine.
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-foreground">{bridgeToken}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(bridgeToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label="Copy"
            >
              {copied ? <Check className="h-4 w-4 text-profit" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <Button onClick={finish}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Add MT5 Account" description="Metadata only - your broker password is never entered here.">
      <div className="space-y-3">
        <div>
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Scalper A" />
        </div>
        <div>
          <Label htmlFor="loginId">MT5 Login ID</Label>
          <Input id="loginId" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="12345678" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="broker">Broker</Label>
            <Input id="broker" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. IC Markets" />
          </div>
          <div>
            <Label htmlFor="server">Server</Label>
            <Input id="server" value={server} onChange={(e) => setServer(e.target.value)} placeholder="e.g. ICMarkets-Demo01" />
          </div>
        </div>
        <div>
          <Label htmlFor="accountType">Account type</Label>
          <Select id="accountType" value={accountType} onChange={(e) => setAccountType(e.target.value as 'DEMO' | 'LIVE')}>
            <option value="DEMO">Demo</option>
            <option value="LIVE">Live</option>
          </Select>
        </div>

        {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!nickname || !loginId || !broker || !server || loading} onClick={submit}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
