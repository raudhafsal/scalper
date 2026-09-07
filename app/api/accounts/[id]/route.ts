import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateAccountSchema } from '@/lib/validation/schemas';
import { handleApiError, jsonError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getCurrentUser();
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('mt5_accounts')
      .select('*, ea_connections(connected, last_heartbeat_at, last_sync_at, ea_version, last_error), mt5_account_settings(*)')
      .eq('id', id)
      .single();

    if (error || !data) return jsonError('Account not found', 404);
    return NextResponse.json({ account: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'accounts:write');
    const { id } = await params;

    const body = updateAccountSchema.parse(await req.json());
    const supabase = await createServerSupabaseClient();

    // RLS scopes this update to accounts the caller owns; a mismatched id
    // simply updates 0 rows rather than leaking existence of another user's
    // account.
    const { data, error } = await supabase
      .from('mt5_accounts')
      .update({
        ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
        ...(body.tradingEnabled !== undefined ? { trading_enabled: body.tradingEnabled } : {}),
        ...(body.accountType !== undefined ? { account_type: body.accountType } : {}),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return jsonError('Account not found', 404);

    await writeAuditLog({
      userId: profile.id,
      action: 'account.update',
      entityType: 'mt5_accounts',
      entityId: id,
      metadata: body,
    });

    return NextResponse.json({ account: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'accounts:write');
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('mt5_accounts').delete().eq('id', id);
    if (error) throw error;

    await writeAuditLog({ userId: profile.id, action: 'account.delete', entityType: 'mt5_accounts', entityId: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
