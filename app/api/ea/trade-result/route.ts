import { NextRequest, NextResponse } from 'next/server';
import { eaTradeResultSchema } from '@/lib/validation/schemas';
import { verifyEaRequest } from '@/lib/security/verify-ea';
import { handleApiError, jsonError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { writeSystemEvent } from '@/lib/audit';

/**
 * EA -> backend execution result. Idempotent: if this command_id has already
 * been marked EXECUTED or FAILED, the request is accepted (200) but does
 * nothing further, so a retried report can never double-count a fill or
 * double-write a closed trade (spec section 11).
 */
export async function POST(req: NextRequest) {
  try {
    const body = eaTradeResultSchema.parse(await req.json());
    const { ok, admin, reason } = await verifyEaRequest(body.accountId, body.bridgeToken);
    if (!ok) return jsonError(reason, 401);

    const { ok: rl } = rateLimit(`ea:trade-result:${body.accountId}`, 60, 60_000);
    if (!rl) return jsonError('Too many requests', 429);

    const { data: command, error: cmdError } = await admin
      .from('trade_commands')
      .select('*')
      .eq('id', body.commandId)
      .single();

    if (cmdError || !command) return jsonError('Unknown command', 404);

    // Reject commands for another account outright (defense in depth - the
    // account is already scoped by the bridge token, but this also guards
    // against a spoofed commandId belonging to a different account).
    if (command.account_id !== body.accountId) {
      return jsonError('Command does not belong to this account', 403);
    }

    if (['EXECUTED', 'FAILED', 'REJECTED', 'EXPIRED'].includes(command.status)) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }

    await admin.from('trade_executions').insert({
      command_id: command.id,
      account_id: body.accountId,
      broker_ticket: body.brokerTicket ?? null,
      execution_price: body.executionPrice ?? null,
      executed_volume: body.executedVolume ?? null,
      success: body.success,
      broker_error_code: body.brokerErrorCode ?? null,
      broker_error_message: body.brokerErrorMessage ?? null,
    });

    await admin
      .from('trade_commands')
      .update({
        status: body.success ? 'EXECUTED' : 'FAILED',
        executed_at: new Date().toISOString(),
        rejection_reason: body.success ? null : body.brokerErrorMessage ?? 'Execution failed',
      })
      .eq('id', command.id);

    if (command.signal_id) {
      await admin
        .from('signals')
        .update({ status: body.success ? 'EXECUTED' : 'REJECTED', rejection_reason: body.success ? null : body.brokerErrorMessage })
        .eq('id', command.signal_id);
    }

    await writeSystemEvent({
      component: 'MT5_BRIDGE',
      eventType: 'trade.execution_result',
      severity: body.success ? 'INFO' : 'ERROR',
      message: body.success
        ? `${command.action} ${command.symbol} executed at ${body.executionPrice ?? 'n/a'} (ticket ${body.brokerTicket ?? 'n/a'})`
        : `${command.action} ${command.symbol} failed: ${body.brokerErrorMessage ?? 'unknown error'}`,
      accountId: body.accountId,
      metadata: { commandId: command.id, brokerErrorCode: body.brokerErrorCode },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
