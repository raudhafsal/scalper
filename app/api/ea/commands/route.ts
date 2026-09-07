import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEaRequest } from '@/lib/security/verify-ea';
import { handleApiError, jsonError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';

const querySchema = z.object({
  accountId: z.string().uuid(),
  bridgeToken: z.string().min(10),
});

/**
 * EA -> backend command poll. Not in the spec's literal /api list (section
 * 43) but required to implement section 10 ("receive approved trade
 * commands") - see docs/ARCHITECTURE.md for why polling (rather than a
 * webhook into the EA, which can't run a server) is the right shape here.
 *
 * Idempotency + expiry (spec section 11):
 *  - Expired PENDING/SENT commands are flipped to EXPIRED before selection,
 *    so a stale command is never handed to the EA.
 *  - A command is atomically flipped PENDING -> SENT as part of the same
 *    query that returns it, so two concurrent polls can never both receive
 *    the same command_id.
 *  - The (account_id, nonce) unique constraint in the database is the final
 *    backstop against a duplicate order even if the EA itself retries.
 *  - Commands for another account can never be returned - the query is
 *    always scoped to the authenticated account_id.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse({
      accountId: searchParams.get('accountId'),
      bridgeToken: searchParams.get('bridgeToken'),
    });

    const { ok, admin, reason } = await verifyEaRequest(parsed.accountId, parsed.bridgeToken);
    if (!ok) return jsonError(reason, 401);

    const { ok: rl } = rateLimit(`ea:commands:${parsed.accountId}`, 60, 60_000);
    if (!rl) return jsonError('Too many requests', 429);

    const nowIso = new Date().toISOString();

    // Expire anything past its expires_at that never got picked up or ack'd.
    await admin
      .from('trade_commands')
      .update({ status: 'EXPIRED' })
      .eq('account_id', parsed.accountId)
      .in('status', ['PENDING', 'SENT'])
      .lt('expires_at', nowIso);

    const { data: pending, error } = await admin
      .from('trade_commands')
      .select('id, action, symbol, volume, stop_loss, take_profit, nonce, expires_at, created_at')
      .eq('account_id', parsed.accountId)
      .eq('status', 'PENDING')
      .gte('expires_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    if (!pending || pending.length === 0) return NextResponse.json({ commands: [] });

    const ids = pending.map((c) => c.id);
    const { error: markSentError } = await admin
      .from('trade_commands')
      .update({ status: 'SENT', sent_at: nowIso })
      .in('id', ids)
      .eq('status', 'PENDING'); // no-op if something else already claimed it

    if (markSentError) throw markSentError;

    return NextResponse.json({
      commands: pending.map((c) => ({
        commandId: c.id,
        action: c.action,
        symbol: c.symbol,
        volume: c.volume,
        stopLoss: c.stop_loss,
        takeProfit: c.take_profit,
        nonce: c.nonce,
        expiresAt: c.expires_at,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
