import type { GlobalTradingStatus, RunMode } from '@/types/database';

export interface StatusPresentation {
  label: string;
  emoji: string;
  tone: 'success' | 'warning' | 'muted' | 'danger';
  pulse: boolean;
}

/**
 * Maps (status, mode) -> the badge shown across the app (spec section 6):
 *   🟢 ACTIVE / ⚪ STOPPED / 🟡 PAPER MODE / 🔴 EMERGENCY STOP
 * plus a 5th state we surface distinctly for STOP_NEW_TRADES, since existing
 * positions are still being managed but nothing new will open.
 */
export function presentTradingStatus(status: GlobalTradingStatus, mode: RunMode): StatusPresentation {
  if (status === 'EMERGENCY_STOPPED') {
    return { label: 'EMERGENCY STOP', emoji: '🔴', tone: 'danger', pulse: false };
  }
  if (status === 'STOPPED') {
    return { label: 'STOPPED', emoji: '⚪', tone: 'muted', pulse: false };
  }
  if (status === 'STOP_NEW_TRADES') {
    return { label: 'NO NEW TRADES', emoji: '🟡', tone: 'warning', pulse: false };
  }
  // ACTIVE
  if (mode === 'PAPER') {
    return { label: 'PAPER MODE', emoji: '🟡', tone: 'warning', pulse: true };
  }
  if (mode === 'DEMO') {
    return { label: 'ACTIVE (DEMO)', emoji: '🟢', tone: 'success', pulse: true };
  }
  return { label: 'ACTIVE (LIVE)', emoji: '🟢', tone: 'success', pulse: true };
}
