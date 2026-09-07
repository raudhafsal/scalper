import { z } from 'zod';

// A conservative allowlist-style symbol pattern - prevents "allow arbitrary
// symbols" (spec section 44). Extend as needed for your broker's naming.
const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9._#-]{3,15}$/, 'Invalid symbol format');

export const createAccountSchema = z.object({
  nickname: z.string().trim().min(1).max(60),
  loginId: z.string().trim().min(1).max(40),
  broker: z.string().trim().min(1).max(80),
  server: z.string().trim().min(1).max(80),
  accountType: z.enum(['DEMO', 'LIVE']),
});

export const updateAccountSchema = z.object({
  nickname: z.string().trim().min(1).max(60).optional(),
  tradingEnabled: z.boolean().optional(),
  accountType: z.enum(['DEMO', 'LIVE']).optional(),
});

export const startTradingSchema = z.object({
  mode: z.enum(['PAPER', 'DEMO', 'LIVE']),
  accountIds: z.array(z.string().uuid()).min(1, 'Select at least one account'),
  confirmedRiskAcknowledgement: z.literal(true),
});

export const emergencyStopSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  confirmationPhrase: z.literal('EMERGENCY STOP'),
});

export const closeAllSchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1),
  confirmationPhrase: z.literal('CLOSE ALL POSITIONS'),
});

export const strategySettingsSchema = z.object({
  primaryTimeframe: z.enum(['M1', 'M5', 'M15']).default('M1'),
  confirmationTimeframe: z.enum(['M1', 'M5', 'M15']).default('M5'),
  optionalTimeframe: z.enum(['M1', 'M5', 'M15']).nullable().optional(),
  minSignalScore: z.number().int().min(0).max(100),
  scoreWeights: z.object({
    marketStructure: z.number().min(0).max(100),
    liquiditySweep: z.number().min(0).max(100),
    bosChoch: z.number().min(0).max(100),
    orderBlock: z.number().min(0).max(100),
    fvg: z.number().min(0).max(100),
    ema: z.number().min(0).max(100),
    rsi: z.number().min(0).max(100),
    atr: z.number().min(0).max(100),
    candleConfirmation: z.number().min(0).max(100),
  }),
  structureLookback: z.number().int().min(5).max(500),
  liquidityLookback: z.number().int().min(5).max(500),
  emaFast: z.number().int().min(2).max(200),
  emaMid: z.number().int().min(2).max(200),
  emaSlow: z.number().int().min(2).max(400),
  emaTrend: z.number().int().min(2).max(500),
  rsiPeriod: z.number().int().min(2).max(100),
  atrPeriod: z.number().int().min(2).max(100),
  slMethod: z.enum(['SWING', 'ATR', 'ORDER_BLOCK']),
  atrSlMultiplier: z.number().min(0.1).max(10),
  tpMode: z.enum(['RR_1_1', 'RR_1_1_5', 'RR_1_2', 'RR_1_3', 'CUSTOM']),
  customRr: z.number().min(0.1).max(20).nullable().optional(),
  breakevenEnabled: z.boolean(),
  breakevenAtR: z.number().min(0.1).max(10),
  partialTpEnabled: z.boolean(),
  partialTpAtR: z.number().min(0.1).max(10),
  partialTpPct: z.number().min(1).max(100),
  trailingEnabled: z.boolean(),
  sessionFilters: z.object({
    asian: z.boolean(),
    london: z.boolean(),
    newyork: z.boolean(),
    overlap: z.boolean(),
  }),
});

export const riskSettingsSchema = z.object({
  riskPerTradePct: z.number().positive().max(10),
  maxDailyLossPct: z.number().positive().max(50),
  maxDrawdownPct: z.number().positive().max(80),
  maxSimultaneousTrades: z.number().int().positive().max(50),
  maxTradesPerSymbol: z.number().int().positive().max(20),
  maxTradesPerDay: z.number().int().positive().max(200),
  maxTradesPerHour: z.number().int().positive().max(50),
  maxConsecutiveLosses: z.number().int().positive().max(20),
  cooldownAfterLossMinutes: z.number().int().min(0).max(1440),
  cooldownAfterTradeMinutes: z.number().int().min(0).max(1440),
  maxSpreadPoints: z.number().positive().max(2000),
  maxLot: z.number().positive().max(1000),
  minEquity: z.number().min(0),
  dailyProfitLockPct: z.number().positive().max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// EA (MT5 bridge) webhooks - authenticated via bridge token, not a session.
// ---------------------------------------------------------------------------

export const eaHeartbeatSchema = z.object({
  accountId: z.string().uuid(),
  bridgeToken: z.string().min(10),
  eaVersion: z.string().max(20),
  terminalBuild: z.number().int().nonnegative(),
  balance: z.number(),
  equity: z.number(),
  margin: z.number(),
  freeMargin: z.number(),
  floatingPl: z.number(),
  currency: z.string().max(6),
  leverage: z.number().int().nonnegative().optional(),
  openPositions: z
    .array(
      z.object({
        ticket: z.string(),
        symbol: symbolSchema,
        direction: z.enum(['BUY', 'SELL']),
        volume: z.number().positive(),
        entryPrice: z.number().positive(),
        stopLoss: z.number().nonnegative().optional(),
        takeProfit: z.number().nonnegative().optional(),
        currentPrice: z.number().nonnegative().optional(),
        floatingPl: z.number().optional(),
        swap: z.number().optional(),
        commission: z.number().optional(),
        openTime: z.string().datetime(),
      }),
    )
    .max(200),
  symbolSpecs: z
    .array(
      z.object({
        symbol: symbolSchema,
        tickSize: z.number().positive(),
        tickValue: z.number().positive(),
        point: z.number().positive(),
        contractSize: z.number().positive(),
        minLot: z.number().positive(),
        maxLot: z.number().positive(),
        lotStep: z.number().positive(),
        stopLevelPoints: z.number().nonnegative(),
        digits: z.number().int().nonnegative(),
      }),
    )
    .max(50)
    .optional(),
});

export const eaAccountStatusSchema = z.object({
  accountId: z.string().uuid(),
  bridgeToken: z.string().min(10),
  connected: z.boolean(),
  lastError: z.string().max(500).nullable().optional(),
});

export const eaTradeResultSchema = z.object({
  accountId: z.string().uuid(),
  bridgeToken: z.string().min(10),
  commandId: z.string().uuid(),
  success: z.boolean(),
  brokerTicket: z.string().max(40).nullable().optional(),
  executionPrice: z.number().nonnegative().nullable().optional(),
  executedVolume: z.number().nonnegative().nullable().optional(),
  brokerErrorCode: z.string().max(20).nullable().optional(),
  brokerErrorMessage: z.string().max(500).nullable().optional(),
});

export type StartTradingInput = z.infer<typeof startTradingSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
