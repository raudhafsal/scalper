import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/current-user';
import { AccountSettingsEditor } from '@/components/settings/account-settings-editor';
import { UserRoleManager } from '@/components/settings/user-role-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Mt5AccountSettings, Profile } from '@/types/database';

export default async function SettingsPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const { data: accounts } = await supabase
    .from('mt5_accounts')
    .select('id, nickname, mt5_account_settings(*)')
    .eq('user_id', profile.id);

  const allProfiles: Profile[] = profile.role === 'ADMIN' ? await getAllProfiles() : [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-foreground">{profile.email}</p>
          <p className="text-muted-foreground">Role: {profile.role}</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Account-Specific Settings</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(accounts ?? []).map((a) => {
            const settings = (Array.isArray(a.mt5_account_settings) ? a.mt5_account_settings[0] : a.mt5_account_settings) as
              | Mt5AccountSettings
              | undefined;
            if (!settings) return null;
            return <AccountSettingsEditor key={a.id} accountId={a.id} nickname={a.nickname} initial={settings} />;
          })}
        </div>
      </div>

      {profile.role === 'ADMIN' && <UserRoleManager profiles={allProfiles} />}
    </div>
  );
}

async function getAllProfiles() {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('*').order('created_at', { ascending: true });
  return data ?? [];
}
