import { describe, expect, it } from 'vitest';
import { computePerformanceMetrics, sessionForTimestamp } from '@/lib/analytics';
import type { ClosedTrade } from '@/types/database';

function trade(profit: number, result: 'WIN' | 'LOSS' | 'BREAKEVEN', duration = 60): Pick<ClosedTrade, 'profit' | 'result' | 'duration_seconds' | 'close_time'> {
  return { profit, result, duration_seconds: duration, close_time: new Date().toISOString() };
}

describe('computePerformanceMetrics', () => {
  it('returns nulls/zeros for an empty trade list rather than fabricating numbers', () => {
    const metrics = computePerformanceMetrics([]);
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.winRate).toBeNull();
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.netProfit).toBe(0);
  });

  it('computes win rate and profit factor correctly', () => {
    const metrics = computePerformanceMetrics([trade(100, 'WIN'), trade(100, 'WIN'), trade(-50, 'LOSS')]);
    expect(metrics.winRate).toBeCloseTo(66.667, 2);
    expect(metrics.profitFactor).toBeCloseTo(4.0, 5);
    expect(metrics.netProfit).toBe(150);
  });

  it('computes max consecutive losses', () => {
    const metrics = computePerformanceMetrics([trade(-10, 'LOSS'), trade(-10, 'LOSS'), trade(10, 'WIN'), trade(-10, 'LOSS')]);
    expect(metrics.maxConsecutiveLosses).toBe(2);
  });

  it('computes max drawdown from the equity curve', () => {
    const metrics = computePerformanceMetrics([trade(100, 'WIN'), trade(-60, 'LOSS'), trade(-20, 'LOSS')]);
    expect(metrics.maxDrawdownPct).toBeCloseTo(80, 5);
  });

  it('profit factor is Infinity when there are wins but no losses', () => {
    const metrics = computePerformanceMetrics([trade(50, 'WIN')]);
    expect(metrics.profitFactor).toBe(Infinity);
  });

  it('profit factor is null when there is neither a win nor a loss', () => {
    const metrics = computePerformanceMetrics([trade(0, 'BREAKEVEN')]);
    expect(metrics.profitFactor).toBeNull();
  });
});

describe('sessionForTimestamp', () => {
  it('classifies the London/NY overlap correctly', () => {
    expect(sessionForTimestamp('2026-01-05T13:00:00.000Z')).toBe('LONDON_NY_OVERLAP');
  });

  it('classifies pure London hours', () => {
    expect(sessionForTimestamp('2026-01-05T08:00:00.000Z')).toBe('LONDON');
  });

  it('classifies pure New York hours', () => {
    expect(sessionForTimestamp('2026-01-05T18:00:00.000Z')).toBe('NEW_YORK');
  });

  it('classifies Asian session hours', () => {
    expect(sessionForTimestamp('2026-01-05T02:00:00.000Z')).toBe('ASIAN');
  });

  it('classifies the off-session gap', () => {
    expect(sessionForTimestamp('2026-01-05T22:00:00.000Z')).toBe('OFF_SESSION');
  });
});
