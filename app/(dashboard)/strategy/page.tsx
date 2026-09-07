import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { StrategyForm } from '@/components/strategy/strategy-form';
import type { StrategySettings } from '@/types/database';

export default async function StrategyPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const { data: strategy } = await supabase
    .from('strategies')
    .select('*, strategy_settings(*)')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .single();

  const settings = (Array.isArray(strategy?.strategy_settings) ? strategy?.strategy_settings[0] : strategy?.strategy_settings) as
    | StrategySettings
    | undefined;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Strategy: {strategy?.name}</h1>
        <p className="text-sm text-muted-foreground">{strategy?.description}</p>
      </div>
      {settings ? (
        <StrategyForm initial={settings} />
      ) : (
        <p className="text-sm text-muted-foreground">No strategy settings found.</p>
      )}
    </div>
  );
}
