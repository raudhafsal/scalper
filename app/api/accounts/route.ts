import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { assertPermission } from '@/lib/auth/permissions';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAccountSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { generateBridgeToken, hashBridgeToken } from '@/lib/security/bridge-token';

export async function GET() {
  try {
    await getCurrentUser();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('mt5_accounts')
      .select('*, ea_connections(connected, last_heartbeat_at, last_sync_at, ea_version, last_error)')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ accounts: data });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Adds a new MT5 account. Only metadata is stored (see spec section 9) - no
 * broker password ever touches this API. A bridge token is generated here
 * and returned RAW exactly once in the response; only its HMAC is persisted.
 * The user pastes the raw token into the EA's input parameters on the MT5
 * terminal - see docs/EA_SETUP.md.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getCurrentUser();
    assertPermission(profile.role, 'accounts:write');

    const { ok } = rateLimit(`accounts:create:${profile.id}`, 10, 60_000);
    if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = createAccountSchema.parse(await req.json());
    const admin = createAdminClient();

    const { data: account, error: accError } = await admin
      .from('mt5_accounts')
      .insert({
        user_id: profile.id,
        nickname: body.nickname,
        login_id: body.loginId,
        broker: body.broker,
        server: body.server,
        account_type: body.accountType,
        connection_status: 'OFFLINE',
      })
      .select()
      .single();

    if (accError) throw accError;

    await admin.from('mt5_account_settings').insert({ account_id: account.id });

    const rawToken = generateBridgeToken();
    const { error: eaError } = await admin.from('ea_connections').insert({
      account_id: account.id,
      bridge_token_hash: hashBridgeToken(rawToken),
    });
    if (eaError) throw eaError;

    await writeAuditLog({
      userId: profile.id,
      action: 'account.create',
      entityType: 'mt5_accounts',
      entityId: account.id,
      metadata: { nickname: body.nickname, accountType: body.accountType, broker: body.broker },
    });

    return NextResponse.json({ account, bridgeToken: rawToken }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
