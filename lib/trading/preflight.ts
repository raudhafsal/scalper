import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pingEngineHealth } from '@/lib/trading-engine-client';
import type { Profile, RunMode } from '@/types/database';
import { can } from '@/lib/auth/permissions';

export interface PreflightCheck {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
}

/**
 * Runs the system checks required before START AUTO TRADING can go through
 * (spec section 32): Authentication, Authorization, Trading engine,
 * Database, Market data, EA connection, Account status, Risk configuration,
 * Emergency-stop state. Fail-safe: any failed *required* check blocks start.
 */
export async function runPreflightChecks(
  supabase: SupabaseClient,
  profile: Profile,
  mode: RunMode,
  accountIds: string[],
): Promise<{ checks: PreflightCheck[]; allPassed: boolean }> {
  const checks: PreflightCheck[] = [];

  checks.push({ key: 'auth', label: 'Authentication', passed: true, required: true });
  checks.push({
    key: 'authz',
    label: 'Authorization',
    passed: can(profile.role, 'trading:start'),
    required: true,
    detail: can(profile.role, 'trading:start') ? undefined : `Role ${profile.role} cannot start trading`,
  });

  const { data: tradingState, error: tsError } = await supabase
    .from('trading_state')
    .select('status')
    .eq('user_id', profile.id)
    .single();

  checks.push({ key: 'database', label: 'Database', passed: !tsError, required: true, detail: tsError?.message });
  checks.push({
    key: 'emergency_stop',
    label: 'Emergency-stop state',
    passed: tradingState?.status !== 'EMERGENCY_STOPPED',
    required: true,
    detail: tradingState?.status === 'EMERGENCY_STOPPED' ? 'Clear the emergency stop before starting' : undefined,
  });

  // Paper mode never touches the engine's live market-data/EA path in a way
  // that risks real orders, but it still needs the engine + market data to
  // produce meaningful simulated signals, so we check it for every mode.
  const health = await pingEngineHealth();
  checks.push({
    key: 'trading_engine',
    label: 'Trading engine',
    passed: health.reachable && health.status !== 'UNHEALTHY',
    required: true,
    detail: health.reachable ? health.status : health.error,
  });
  checks.push({
    key: 'market_data',
    label: 'Market data',
    passed: health.reachable && !!health.marketDataOk,
    required: true,
    detail: health.reachable ? undefined : 'Trading engine unreachable',
  });
  checks.push({
    key: 'risk_engine',
    label: 'Risk configuration',
    passed: health.reachable && !!health.riskEngineOk,
    required: true,
  });

  if (mode !== 'PAPER') {
    const { data: accounts, error: accError } = await supabase
      .from('mt5_accounts')
      .select('id, nickname, trading_enabled, connection_status, ea_connections(connected, last_heartbeat_at)')
      .in('id', accountIds);

    const accountsOk = !accError && (accounts ?? []).every((a) => {
      const ea = Array.isArray(a.ea_connections) ? a.ea_connections[0] : a.ea_connections;
      const heartbeatFresh = ea?.last_heartbeat_at
        ? Date.now() - new Date(ea.last_heartbeat_at).getTime() < 60_000
        : false;
      return a.trading_enabled && a.connection_status === 'CONNECTED' && ea?.connected && heartbeatFresh;
    });

    checks.push({
      key: 'account_status',
      label: 'Account status',
      passed: !!accounts?.length && accountsOk,
      required: true,
      detail: accountsOk ? undefined : 'One or more selected accounts are not connected/enabled',
    });
    checks.push({
      key: 'ea_connection',
      label: 'EA connection',
      passed: !!accounts?.length && accountsOk,
      required: true,
    });
  } else {
    checks.push({ key: 'account_status', label: 'Account status', passed: true, required: false, detail: 'Not required in paper mode' });
    checks.push({ key: 'ea_connection', label: 'EA connection', passed: true, required: false, detail: 'Not required in paper mode' });
  }

  const allPassed = checks.filter((c) => c.required).every((c) => c.passed);
  return { checks, allPassed };
}
