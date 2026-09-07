// Shared domain types used across the web app, API routes, and (conceptually)
// mirrored by the Python trading engine's Pydantic models. Keep these two in
// sync manually - see trading-engine/engine/db/schemas.py.

export type UserRole = 'ADMIN' | 'TRADER' | 'VIEWER';

export type AccountMode = 'PAPER' | 'DEMO' | 'LIVE';

export type AccountConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'OFFLINE'
  | 'DISABLED'
  | 'RISK_LOCKED';

/**
 * Drives the "AUTO TRADING STATUS" badge. Combined with `mode` (PAPER/DEMO/LIVE)
 * on the trading_state row to fully describe what the system is doing:
 *  - STOPPED            -> ⚪ STOPPED
 *  - ACTIVE + mode=PAPER -> 🟡 PAPER MODE
 *  - ACTIVE + mode!=PAPER -> 🟢 ACTIVE
 *  - STOP_NEW_TRADES    -> 🟢 (dimmed) "no new trades" - existing positions still managed
 *  - EMERGENCY_STOPPED  -> 🔴 EMERGENCY STOP
 */
export type GlobalTradingState = 'STOPPED' | 'ACTIVE' | 'STOP_NEW_TRADES' | 'EMERGENCY_STOPPED';

export type SignalStatus = 'WAITING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';

export type SignalDirection = 'BUY' | 'SELL';

export type TradeCommandAction =
  | 'BUY'
  | 'SELL'
  | 'CLOSE'
  | 'MODIFY_SL'
  | 'MODIFY_TP'
  | 'STOP_TRADING';

export type TradeCommandStatus =
  | 'PENDING'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FAILED';

export type SlMethod = 'SWING' | 'ATR' | 'ORDER_BLOCK';

export type TpMode = 'RR_1_1' | 'RR_1_1_5' | 'RR_1_2' | 'RR_1_3' | 'CUSTOM';

export interface Session {
  id: string;
  name: string;
  createdAt: string;
}

/** Minimal shape of a symbol specification report the EA sends per account. */
export interface SymbolSpec {
  symbol: string;
  tickSize: number;
  tickValue: number;
  point: number;
  contractSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  stopLevelPoints: number;
  digits: number;
}

export const RISK_DEFAULTS = {
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
  dailyProfitLockPct: null as number | null,
} as const;

export const SIGNAL_SCORE_WEIGHTS = {
  marketStructure: 20,
  liquiditySweep: 15,
  bosChoch: 15,
  orderBlock: 15,
  fvg: 10,
  ema: 10,
  rsi: 5,
  atr: 5,
  candleConfirmation: 5,
} as const; // sums to 100

export const DEFAULT_MIN_SIGNAL_SCORE = 80;
