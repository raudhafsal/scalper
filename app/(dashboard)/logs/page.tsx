import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils';

export default async function LogsPage() {
  await getCurrentUser();
  const supabase = await createServerSupabaseClient();

  const { data: logs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">Audit Logs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Actions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Action</th>
                <th className="pb-2 pr-3 font-medium">Entity</th>
                <th className="pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{l.action}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {l.entity_type ?? '—'} {l.entity_id ? `(${l.entity_id.slice(0, 8)})` : ''}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{formatRelativeTime(l.created_at)}</td>
                </tr>
              ))}
              {(logs ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No audit events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Audit logs never contain secrets - passwords, bridge tokens, and API keys are never written here.
      </p>
    </div>
  );
}
