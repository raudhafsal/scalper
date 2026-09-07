import { NextRequest, NextResponse } from 'next/server';
import { eaAccountStatusSchema } from '@/lib/validation/schemas';
import { verifyEaRequest } from '@/lib/security/verify-ea';
import { handleApiError, jsonError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeSystemEvent } from '@/lib/audit';

/**
 * EA -> backend explicit connect/disconnect/error report. The EA calls this
 * on OnInit/OnDeinit and whenever it hits a broker error it wants surfaced
 * on the System Health / Accounts pages immediately, rather than waiting for
 * the next heartbeat.
 */
export async function POST(req: NextRequest) {
  try {
    const body = eaAccountStatusSchema.parse(await req.json());
    const { ok, admin, connectionId, reason } = await verifyEaRequest(body.accountId, body.bridgeToken);
    if (!ok) return jsonError(reason, 401);

    const { ok: rl } = rateLimit(`ea:status:${body.accountId}`, 30, 60_000);
    if (!rl) return jsonError('Too many requests', 429);

    await admin
      .from('ea_connections')
      .update({ connected: body.connected, last_error: body.lastError ?? null })
      .eq('id', connectionId);

    await admin
      .from('mt5_accounts')
      .update({ connection_status: body.connected ? 'CONNECTED' : 'OFFLINE' })
      .eq('id', body.accountId);

    await writeSystemEvent({
      component: 'MT5_BRIDGE',
      eventType: body.connected ? 'ea.connected' : 'ea.disconnected',
      severity: body.connected ? 'INFO' : 'WARNING',
      message: body.connected ? 'EA connected.' : `EA disconnected${body.lastError ? `: ${body.lastError}` : '.'}`,
      accountId: body.accountId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
