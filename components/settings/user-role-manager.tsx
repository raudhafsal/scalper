'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import type { Profile, UserRole } from '@/types/database';

export function UserRoleManager({ profiles }: { profiles: Profile[] }) {
  const [rows, setRows] = useState(profiles);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id);
    const supabase = createClient();
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (!error) setRows((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
    setSavingId(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Roles (Admin)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <div>
              <div className="font-medium text-foreground">{p.full_name || p.email}</div>
              <div className="text-xs text-muted-foreground">{p.email}</div>
            </div>
            <Select
              className="w-32"
              value={p.role}
              disabled={savingId === p.id}
              onChange={(e) => changeRole(p.id, e.target.value as UserRole)}
            >
              <option value="ADMIN">ADMIN</option>
              <option value="TRADER">TRADER</option>
              <option value="VIEWER">VIEWER</option>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
