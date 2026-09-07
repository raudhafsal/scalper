import { NextRequest, NextResponse } from 'next/server';
import { eaHeartbeatSchema } from '@/lib/validation/schemas';
import { verifyEaRequest } from '@/lib/security/verify-ea';
import { handleApiError, jsonError } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';

/**
 * EA -> backend heartbeat. Called on a short interval (e.g. every 5-15s) by
 * MT5_Scalp_Bridge.mq5. Updates balance/equity/margin, open positions, and
 * (occasionally) symbol specs. This is the sole source of truth for account
 * connection status - see docs/EA_SETUP.md.
 */
export async function POST(req: NextRequest) {
  try {
    const body = eaHeartbeatSchema.parse(await req.json());

    const { ok, admin, connectionId, reason } = await verifyEaRequest(body.accountId, body.bridgeToken);
    if (!ok) return jsonError(reason, 401);

    const { ok: rl } = rateLimit(`ea:heartbeat:${body.accountId}`, 30, 60_000);
    if (!rl) return jsonError('Too many requests', 429);

    const now = new Date().toISOString();

    await admin
      .from('ea_connections')
      .update({
        connected: true,
        last_heartbeat_at: now,
        last_sync_at: now,
        ea_version: body.eaVersion,
        terminal_build: body.terminalBuild,
        last_error: null,
        ...(body.symbolSpecs
          ? { symbol_specs: Object.fromEntries(body.symbolSpecs.map((s) => [s.symbol, s])) }
          : {}),
      })
      .eq('id', connectionId);

    await admin
      .from('mt5_accounts')
      .update({
        connection_status: 'CONNECTED',
        balance: body.balance,
        equity: body.equity,
        margin: body.margin,
        free_margin: body.freeMargin,
        floating_pl: body.floatingPl,
        currency: body.currency,
        leverage: body.leverage ?? null,
      })
      .eq('id', body.accountId);

    // Mirror open positions: upsert what the EA reports, and close out any
    // position we have marked OPEN that the EA no longer reports (it must
    // have closed at the broker - the terminal is the source of truth here).
    const reportedTickets = body.openPositions.map((p) => p.ticket);

    if (body.openPositions.length > 0) {
      await admin.from('positions').upsert(
        body.openPositions.map((p) => ({
          account_id: body.accountId,
          broker_ticket: p.ticket,
          symbol: p.symbol,
          direction: p.direction,
          volume: p.volume,
          entry_price: p.entryPrice,
          stop_loss: p.stopLoss ?? null,
          take_profit: p.takeProfit ?? null,
          current_price: p.currentPrice ?? null,
          floating_pl: p.floatingPl ?? 0,
          swap: p.swap ?? 0,
          commission: p.commission ?? 0,
          status: 'OPEN',
          open_time: p.openTime,
          updated_at: now,
        })),
        { onConflict: 'account_id,broker_ticket' },
      );
    }

    const { data: staleFull } = await admin
      .from('positions')
      .select('*')
      .eq('account_id', body.accountId)
      .eq('status', 'OPEN');

    const stalePositions = (staleFull ?? []).filter((p) => !reportedTickets.includes(p.broker_ticket));

    if (stalePositions.length > 0) {
      // The EA no longer reports these tickets as open, so the broker closed
      // them between heartbeats. We approximate the close with the last
      // known current_price/floating_pl from our previous heartbeat, since a
      // plain heartbeat doesn't carry an explicit close event - extend the
      // EA (OnTradeTransaction) to POST an exact close price/time to
      // /api/ea/trade-result for perfect accuracy; this keeps the dashboard
      // correct in the meantime without ever losing a trade record.
      await admin.from('closed_trades').upsert(
        stalePositions.map((p) => ({
          account_id: p.account_id,
          broker_ticket: p.broker_ticket,
          symbol: p.symbol,
          direction: p.direction,
          volume: p.volume,
          entry_price: p.entry_price,
          exit_price: p.current_price ?? p.entry_price,
          stop_loss: p.stop_loss,
          take_profit: p.take_profit,
          profit: p.floating_pl,
          commission: p.commission,
          swap: p.swap,
          strategy_id: p.strategy_id,
          signal_id: p.signal_id,
          run_mode: p.run_mode,
          open_time: p.open_time,
          close_time: now,
          result: p.floating_pl > 0 ? 'WIN' : p.floating_pl < 0 ? 'LOSS' : 'BREAKEVEN',
        })),
        { onConflict: 'account_id,broker_ticket,close_time', ignoreDuplicates: true },
      );

      await admin
        .from('positions')
        .delete()
        .in('id', stalePositions.map((p) => p.id));
    }

    return NextResponse.json({ ok: true, serverTime: now });
  } catch (err) {
    return handleApiError(err);
  }
}
