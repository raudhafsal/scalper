import { beforeAll, describe, expect, it } from 'vitest';
import { generateBridgeToken, hashBridgeToken, verifyBridgeToken } from '@/lib/security/bridge-token';

beforeAll(() => {
  process.env.MT5_BRIDGE_SIGNING_SECRET = 'test-signing-secret-do-not-use-in-prod';
});

describe('bridge token', () => {
  it('generates a token that is not the broker password (random, prefixed, long)', () => {
    const token = generateBridgeToken();
    expect(token.startsWith('mt5br_')).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it('two generated tokens are different', () => {
    expect(generateBridgeToken()).not.toBe(generateBridgeToken());
  });

  it('verifies a correctly hashed token', () => {
    const token = generateBridgeToken();
    const hash = hashBridgeToken(token);
    expect(verifyBridgeToken(token, hash)).toBe(true);
  });

  it('rejects a tampered token against the stored hash', () => {
    const token = generateBridgeToken();
    const hash = hashBridgeToken(token);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyBridgeToken(tampered, hash)).toBe(false);
  });

  it('rejects a token for a different account (different stored hash)', () => {
    const tokenA = generateBridgeToken();
    const tokenB = generateBridgeToken();
    const hashA = hashBridgeToken(tokenA);
    expect(verifyBridgeToken(tokenB, hashA)).toBe(false);
  });

  it('the raw token is never recoverable from its hash', () => {
    const token = generateBridgeToken();
    const hash = hashBridgeToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64); // sha256 hex digest
  });
});
