import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { RiskForm } from '@/components/risk/risk-form';

export default async function RiskPage() {
  const { profile } = await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const { data: riskProfiles } = await supabase
    .from('risk_settings')
    .select('*')
    .eq('user_id', profile.id)
    .order('is_default', { ascending: false });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">Risk Management</h1>
      <p className="text-sm text-muted-foreground">
        Every account is evaluated against a risk profile independently. Assign a custom profile per
        account on the Accounts page, or leave accounts on this default profile.
      </p>
      {(riskProfiles ?? []).map((rp) => (
        <RiskForm key={rp.id} initial={rp} />
      ))}
    </div>
  );
}
