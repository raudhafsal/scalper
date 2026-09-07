import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold text-foreground">You&rsquo;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        MT5 Scalp Command Center needs a live connection to Supabase and the trading engine to show
        current balances and to accept trading actions. Read-only cached data is not shown here for a
        financial app, by design &mdash; reconnect to see live state.
      </p>
      <p className="text-xs text-muted-foreground">
        Note: no trading commands are ever queued for later delivery while offline.
      </p>
    </div>
  );
}
