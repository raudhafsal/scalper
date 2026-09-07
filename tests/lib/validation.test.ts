import { describe, expect, it } from 'vitest';
import {
  createAccountSchema,
  emergencyStopSchema,
  closeAllSchema,
  eaHeartbeatSchema,
  startTradingSchema,
  riskSettingsSchema,
} from '@/lib/validation/schemas';

describe('createAccountSchema', () => {
  it('accepts a valid payload', () => {
    const result = createAccountSchema.safeParse({
      nickname: 'Scalper A',
      loginId: '12345678',
      broker: 'IC Markets',
      server: 'ICMarkets-Demo01',
      accountType: 'DEMO',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid account type', () => {
    const result = createAccountSchema.safeParse({
      nickname: 'X',
      loginId: '1',
      broker: 'B',
      server: 'S',
      accountType: 'PRACTICE',
    });
    expect(result.success).toBe(false);
  });
});

describe('startTradingSchema - arbitrary symbols / unauthenticated trading guardrails', () => {
  it('requires the explicit risk acknowledgement literal', () => {
    const result = startTradingSchema.safeParse({
      mode: 'LIVE',
      accountIds: ['11111111-1111-1111-1111-111111111111'],
      confirmedRiskAcknowledgement: false,
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one account', () => {
    const result = startTradingSchema.safeParse({
      mode: 'PAPER',
      accountIds: [],
      confirmedRiskAcknowledgement: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown mode', () => {
    const result = startTradingSchema.safeParse({
      mode: 'TURBO',
      accountIds: ['11111111-1111-1111-1111-111111111111'],
      confirmedRiskAcknowledgement: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('emergencyStopSchema - confirmation phrase must match exactly', () => {
  it('accepts the exact phrase', () => {
    const result = emergencyStopSchema.safeParse({ reason: 'broker outage', confirmationPhrase: 'EMERGENCY STOP' });
    expect(result.success).toBe(true);
  });

  it('rejects a near-miss phrase', () => {
    const result = emergencyStopSchema.safeParse({ reason: 'broker outage', confirmationPhrase: 'emergency stop' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing reason', () => {
    const result = emergencyStopSchema.safeParse({ reason: '', confirmationPhrase: 'EMERGENCY STOP' });
    expect(result.success).toBe(false);
  });
});

describe('closeAllSchema - separate strong confirmation from emergency stop', () => {
  it('accepts the exact phrase', () => {
    const result = closeAllSchema.safeParse({
      accountIds: ['11111111-1111-1111-1111-111111111111'],
      confirmationPhrase: 'CLOSE ALL POSITIONS',
    });
    expect(result.success).toBe(true);
  });

  it('rejects the emergency-stop phrase (the two confirmations must not be interchangeable)', () => {
    const result = closeAllSchema.safeParse({
      accountIds: ['11111111-1111-1111-1111-111111111111'],
      confirmationPhrase: 'EMERGENCY STOP',
    });
    expect(result.success).toBe(false);
  });
});

describe('eaHeartbeatSchema - symbol allowlist pattern (never allow arbitrary symbols)', () => {
  const base = {
    accountId: '11111111-1111-1111-1111-111111111111',
    bridgeToken: 'mt5br_abcdefghijklmnopqrstuvwxyz',
    eaVersion: '1.00',
    terminalBuild: 4000,
    balance: 10000,
    equity: 10000,
    margin: 0,
    freeMargin: 10000,
    floatingPl: 0,
    currency: 'USD',
    openPositions: [] as unknown[],
  };

  it('accepts a normal heartbeat', () => {
    expect(eaHeartbeatSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a malformed symbol in an open position', () => {
    const result = eaHeartbeatSchema.safeParse({
      ...base,
      openPositions: [
        {
          ticket: '1',
          symbol: "EURUSD'; DROP TABLE positions;--",
          direction: 'BUY',
          volume: 0.1,
          entryPrice: 1.1,
          openTime: new Date().toISOString(),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative volume', () => {
    const result = eaHeartbeatSchema.safeParse({
      ...base,
      openPositions: [
        { ticket: '1', symbol: 'EURUSD', direction: 'BUY', volume: -1, entryPrice: 1.1, openTime: new Date().toISOString() },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('riskSettingsSchema - never allow unlimited lots or non-positive risk', () => {
  const valid = {
    riskPerTradePct: 0.5,
    maxDailyLossPct: 3,
    maxDrawdownPct: 10,
    maxSimultaneousTrades: 3,
    maxTradesPerSymbol: 1,
    maxTradesPerDay: 15,
    maxTradesPerHour: 4,
    maxConsecutiveLosses: 3,
    cooldownAfterLossMinutes: 15,
    cooldownAfterTradeMinutes: 2,
    maxSpreadPoints: 25,
    maxLot: 5,
    minEquity: 100,
  };

  it('accepts a sane profile', () => {
    expect(riskSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero max lot (unlimited-lot loophole)', () => {
    expect(riskSettingsSchema.safeParse({ ...valid, maxLot: 0 }).success).toBe(false);
  });

  it('rejects a negative risk-per-trade percentage', () => {
    expect(riskSettingsSchema.safeParse({ ...valid, riskPerTradePct: -1 }).success).toBe(false);
  });

  it('caps max lot at a sane upper bound', () => {
    expect(riskSettingsSchema.safeParse({ ...valid, maxLot: 999999 }).success).toBe(false);
  });
});
