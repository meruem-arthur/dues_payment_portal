/**
 * Lightweight in-memory rate limiter.
 *
 * Deliberately dependency-free: no Redis, no external service, nothing to
 * provision. That has one real tradeoff worth knowing: state lives in this
 * process's memory, so it resets on restart, and on a serverless platform
 * with multiple concurrent instances (e.g. Vercel) each instance keeps its
 * own counts - so the effective limit is "per warm instance", not a hard
 * global cap across your whole deployment. For closing off scripted
 * reference-number guessing or someone hammering the payment provider
 * through this endpoint, a best-effort per-instance limit is a big
 * improvement over no limit at all. If this app ever runs across many
 * concurrent serverless instances and that gap becomes a real problem, swap
 * the body of checkRateLimit() for a shared store (e.g. Upstash Redis) -
 * every call site keeps working unchanged since they only depend on the
 * checkRateLimit()/getClientIp() signatures below.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Forget expired buckets periodically so this Map can't grow unbounded on a
// long-running process (e.g. Render). Serverless instances get recycled on
// their own, but this keeps memory-conscious behavior on any host.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweepIfNeeded(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter: allows up to `limit` calls per `windowMs` for a
 * given key. Call once near the top of a handler and bail out early if
 * `.allowed` is false, before doing any real work (DB reads, provider calls).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepIfNeeded(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Test-only escape hatch so each test starts from a clean slate. */
export function __resetRateLimitStateForTests() {
  buckets.clear();
}

/**
 * Best-effort client IP extraction behind a proxy/CDN (Vercel, Render,
 * etc). x-forwarded-for can be a comma-separated chain of proxies; the
 * first entry is the original client. Falls back to "unknown" (which still
 * rate-limits correctly, just as a single shared bucket) rather than
 * throwing, since a missing header should never break checkout.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Same idea as getClientIp(), for call sites that receive headers as a
 * plain object instead of a Headers instance - e.g. NextAuth's
 * `authorize(credentials, req)` callback, where `req.headers` is a plain
 * key/value record, not a Fetch API Headers with `.get()`.
 */
export function getClientIpFromHeaderRecord(headers: Record<string, string | string[] | undefined> | undefined): string {
  const forwardedRaw = headers?.["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedRaw) ? forwardedRaw[0] : forwardedRaw;
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIpRaw = headers?.["x-real-ip"];
  const realIp = Array.isArray(realIpRaw) ? realIpRaw[0] : realIpRaw;
  if (realIp) return realIp;

  return "unknown";
}
