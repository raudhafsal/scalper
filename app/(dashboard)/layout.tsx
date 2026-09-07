import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/top-bar';
import type { Profile, TradingState } from '@/types/database';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: profile }, { data: tradingState }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('trading_state').select('*').eq('user_id', user.id).single(),
  ]);

  if (!profile) redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar profile={profile as Profile} initialTradingState={tradingState as TradingState} />
        <main className="flex-1 overflow-x-hidden pb-20 md:pb-6">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
