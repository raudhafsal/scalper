'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge, StatusDot } from '@/components/ui/badge';
import { presentTradingStatus } from '@/lib/trading-status';
import type { Profile, TradingState } from '@/types/database';
import { useRealtimeTable } from '@/hooks/use-realtime-table';

export function TopBar({
  profile,
  initialTradingState,
  onMenuClick,
}: {
  profile: Profile;
  initialTradingState: TradingState;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [tradingState, setTradingState] = useState(initialTradingState);

  useRealtimeTable<TradingState>(
    'trading_state',
    (payload) => {
      if (payload.new && 'status' in payload.new) setTradingState(payload.new as TradingState);
    },
    `user_id=eq.${profile.id}`,
  );

  const status = presentTradingStatus(tradingState.status, tradingState.mode);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <button className="p-1 text-muted-foreground md:hidden" onClick={onMenuClick} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <Badge tone={status.tone} className="font-semibold">
          <StatusDot tone={status.tone} pulse={status.pulse} />
          {status.emoji} {status.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-foreground">{profile.full_name || profile.email}</div>
          <div className="text-xs text-muted-foreground">{profile.role}</div>
        </div>
        <button
          onClick={signOut}
          className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
