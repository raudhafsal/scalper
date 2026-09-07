import 'server-only';

/**
 * Thin client for the trading engine's own tiny control/health HTTP API
 * (see trading-engine/engine/control_api.py). The web app is NEVER the
 * source of truth for trading state - the engine polls `trading_state` and
 * the account/risk/strategy tables in Supabase itself on a short interval
 * and that poll is what actually gates whether it trades (fail-safe rule,
 * spec section 45). Calls here are just a best-effort "wake up now" nudge
 * for a snappier UI, plus a health check used by the pre-flight checklist
 * and the System Health page.
 */

const TIMEOUT_MS = 3000;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

export interface EngineHealth {
  reachable: boolean;
  status?: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  marketDataOk?: boolean;
  riskEngineOk?: boolean;
  latencyMs?: number;
  lastHeartbeatAt?: string;
  error?: string;
}

export async function pingEngineHealth(): Promise<EngineHealth> {
  const url = process.env.TRADING_ENGINE_URL;
  const apiKey = process.env.TRADING_ENGINE_API_KEY;

  if (!url || !apiKey) {
    return { reachable: false, error: 'TRADING_ENGINE_URL/TRADING_ENGINE_API_KEY not configured' };
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { reachable: false, latencyMs, error: `Engine returned ${res.status}` };

    const body = (await res.json()) as {
      status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
      marketDataOk: boolean;
      riskEngineOk: boolean;
      lastHeartbeatAt: string;
    };

    return {
      reachable: true,
      latencyMs,
      status: body.status,
      marketDataOk: body.marketDataOk,
      riskEngineOk: body.riskEngineOk,
      lastHeartbeatAt: body.lastHeartbeatAt,
    };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** Best-effort only - never let a failure here block a stop/emergency-stop action. */
export async function notifyEngineRefresh(userId: string): Promise<void> {
  const url = process.env.TRADING_ENGINE_URL;
  const apiKey = process.env.TRADING_ENGINE_API_KEY;
  if (!url || !apiKey) return;

  try {
    await fetchWithTimeout(`${url.replace(/\/$/, '')}/control/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Non-fatal: the engine's own poll loop will pick up the state change
    // within its normal interval regardless.
  }
}
