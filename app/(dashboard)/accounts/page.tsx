import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { AccountsClient } from '@/components/accounts/accounts-client';

export default async function AccountsPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const { data: accounts } = await supabase
    .from('mt5_accounts')
    .select('*, ea_connections(connected, last_heartbeat_at, last_sync_at, ea_version, last_error)')
    .order('created_at', { ascending: true });

  return <AccountsClient accounts={accounts ?? []} role={profile.role} />;
}
