import type { ClosedTrade } from '@/types/database';

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  netProfit: number;
  maxDrawdownPct: number;
  maxConsecutiveLosses: number;
  avgTradeDurationSeconds: number;
}

/**
 * Pure function, no I/O - computes real performance stats from an array of
 * closed_trades rows. Used by /api/analytics and the trading-engine's
 * backtester (mirrored in trading-engine/engine/analytics.py) so live and
 * backtested numbers are computed the same way. Never fabricates results;
 * an empty input returns nulls/zeros rather than invented numbers.
 */
export function computePerformanceMetrics(trades: Pick<ClosedTrade, 'profit' | 'result' | 'duration_seconds' | 'close_time'>[]): PerformanceMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.result === 'WIN');
  const losses = trades.filter((t) => t.result === 'LOSS');
  const breakevens = trades.filter((t) => t.result === 'BREAKEVEN');

  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0);

  // Equity-curve max drawdown, computed from the sequence of closed trades
  // (chronological order is the caller's responsibility).
  let runningEquity = 0;
  let peak = 0;
  let maxDrawdownPct = 0;
  for (const t of trades) {
    runningEquity += t.profit;
    peak = Math.max(peak, runningEquity);
    if (peak > 0) {
      const dd = ((peak - runningEquity) / peak) * 100;
      maxDrawdownPct = Math.max(maxDrawdownPct, dd);
    }
  }

  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.result === 'LOSS') {
      currentStreak += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const avgDuration =
    totalTrades > 0 ? trades.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0) / totalTrades : 0;

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: totalTrades > 0 ? (wins.length / totalTrades) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? -grossLoss / losses.length : 0,
    netProfit,
    maxDrawdownPct,
    maxConsecutiveLosses,
    avgTradeDurationSeconds: Math.round(avgDuration),
  };
}

export type TradingSession = 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'LONDON_NY_OVERLAP' | 'OFF_SESSION';

/**
 * Session boundaries in UTC (spec section 22 - stored/computed in UTC,
 * displayed in the user's local timezone by the UI layer). These are
 * approximate, commonly-used session windows; adjust in
 * trading-engine/engine/strategy_engine/sessions.py if your broker's
 * server time / DST handling needs to differ.
 */
export function sessionForTimestamp(iso: string): TradingSession {
  const hourUtc = new Date(iso).getUTCHours();
  const inAsian = hourUtc >= 0 && hourUtc < 9;
  const inLondon = hourUtc >= 7 && hourUtc < 16;
  const inNewYork = hourUtc >= 12 && hourUtc < 21;
  const inOverlap = hourUtc >= 12 && hourUtc < 16;

  if (inOverlap) return 'LONDON_NY_OVERLAP';
  if (inLondon) return 'LONDON';
  if (inNewYork) return 'NEW_YORK';
  if (inAsian) return 'ASIAN';
  return 'OFF_SESSION';
}
