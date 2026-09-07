/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * LIMITATION: this state lives in the Node.js process handling the request.
 * On Vercel, serverless functions are not guaranteed to be the same process
 * between requests, so this provides best-effort protection only. For real
 * production hardening, swap this for a shared store (Upstash Redis is the
 * standard pairing with Vercel) - see docs/TROUBLESHOOTING.md. It still
 * meaningfully slows down a single hot loop hitting one warm instance, and
 * every mutating endpoint calls it, so replacing the backing store later is
 * a one-file change.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0 };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count };
}
