import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { handleApiError, jsonError } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit';

const patchSchema = z.object({
  useGlobalSettings: z.boolean().optional(),
  allowedSymbols: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9._#-]{3,15}$/)).max(50).optional(),
  maxTradesOverride: z.number().int().positive().max(50).nullable().optional(),
  maxLotOverride: z.number().positive().max(1000).nullable().optional(),
  sessionsEnabled: z
    .object({ asian: z.boolean(), london: z.boolean(), newyork: z.boolean(), overlap: z.boolean() })
    .optional(),
  riskSettingsId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'accounts:write');
    const { id } = await params;

    const body = patchSchema.parse(await req.json());
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('mt5_account_settings')
      .update({
        ...(body.useGlobalSettings !== undefined ? { use_global_settings: body.useGlobalSettings } : {}),
        ...(body.allowedSymbols !== undefined ? { allowed_symbols: body.allowedSymbols } : {}),
        ...(body.maxTradesOverride !== undefined ? { max_trades_override: body.maxTradesOverride } : {}),
        ...(body.maxLotOverride !== undefined ? { max_lot_override: body.maxLotOverride } : {}),
        ...(body.sessionsEnabled !== undefined ? { sessions_enabled: body.sessionsEnabled } : {}),
        ...(body.riskSettingsId !== undefined ? { risk_settings_id: body.riskSettingsId } : {}),
      })
      .eq('account_id', id)
      .select()
      .single();

    if (error || !data) return jsonError('Account settings not found', 404);

    await writeAuditLog({ userId: profile.id, action: 'account.settings.update', entityType: 'mt5_account_settings', entityId: id, metadata: body });

    return NextResponse.json({ settings: data });
  } catch (err) {
    return handleApiError(err);
  }
}
