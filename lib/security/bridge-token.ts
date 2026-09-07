import 'server-only';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Bridge tokens authenticate an MT5 EA instance to the trading engine's
 * webhook endpoints (/api/ea/*). They are NOT broker passwords - see spec
 * section 9. A raw token is shown to the user exactly once (at account
 * creation / rotation time, for them to paste into the EA's input
 * parameters); only its HMAC is stored in `ea_connections.bridge_token_hash`.
 */

const PREFIX = 'mt5br';

export function generateBridgeToken(): string {
  return `${PREFIX}_${randomBytes(32).toString('hex')}`;
}

function signingSecret(): string {
  const secret = process.env.MT5_BRIDGE_SIGNING_SECRET;
  if (!secret) {
    throw new Error('MT5_BRIDGE_SIGNING_SECRET is not configured on the server.');
  }
  return secret;
}

export function hashBridgeToken(rawToken: string): string {
  return createHmac('sha256', signingSecret()).update(rawToken).digest('hex');
}

export function verifyBridgeToken(rawToken: string, storedHash: string): boolean {
  const computed = Buffer.from(hashBridgeToken(rawToken), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}
