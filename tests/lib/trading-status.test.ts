import { describe, expect, it } from 'vitest';
import { presentTradingStatus } from '@/lib/trading-status';

describe('presentTradingStatus', () => {
  it('shows EMERGENCY STOP regardless of mode', () => {
    expect(presentTradingStatus('EMERGENCY_STOPPED', 'LIVE').label).toBe('EMERGENCY STOP');
    expect(presentTradingStatus('EMERGENCY_STOPPED', 'PAPER').label).toBe('EMERGENCY STOP');
  });

  it('shows STOPPED', () => {
    expect(presentTradingStatus('STOPPED', 'PAPER').label).toBe('STOPPED');
  });

  it('shows PAPER MODE when active in paper mode', () => {
    const result = presentTradingStatus('ACTIVE', 'PAPER');
    expect(result.label).toBe('PAPER MODE');
    expect(result.tone).toBe('warning');
  });

  it('shows ACTIVE (LIVE) with success tone when active in live mode', () => {
    const result = presentTradingStatus('ACTIVE', 'LIVE');
    expect(result.label).toBe('ACTIVE (LIVE)');
    expect(result.tone).toBe('success');
  });

  it('shows NO NEW TRADES for stop-new-trades state', () => {
    expect(presentTradingStatus('STOP_NEW_TRADES', 'DEMO').label).toBe('NO NEW TRADES');
  });
});
