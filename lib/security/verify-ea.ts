import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyBridgeToken } from '@/lib/security/bridge-token';

/**
 * Authenticates an inbound EA webhook call. The EA never has a Supabase
 * session - it authenticates with (accountId, bridgeToken) instead. This
 * verifies the token against the stored hash and confirms the token belongs
 * to the account it claims, rejecting cross-account use (spec section 11:
 * "Commands for another account must be rejected" applies symmetrically to
 * inbound reports too).
 */
export async function verifyEaRequest(accountId: string, bridgeToken: string) {
  const admin = createAdminClient();

  const { data: connection, error } = await admin
    .from('ea_connections')
    .select('id, account_id, bridge_token_hash')
    .eq('account_id', accountId)
    .single();

  if (error || !connection) {
    return { ok: false as const, reason: 'Unknown account' };
  }

  if (!verifyBridgeToken(bridgeToken, connection.bridge_token_hash)) {
    return { ok: false as const, reason: 'Invalid bridge token' };
  }

  return { ok: true as const, admin, connectionId: connection.id };
}
