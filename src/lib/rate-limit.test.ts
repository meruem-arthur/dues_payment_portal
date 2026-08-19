import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, getClientIp, __resetRateLimitStateForTests } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitStateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("key-a", 3, 1000).allowed).toBe(true);
    }
  });

  it("blocks the request once the limit is exceeded", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("key-a", 3, 1000);
    const result = checkRateLimit("key-a", 3, 1000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("key-a", 3, 1000);
    // key-a is now exhausted, but a different key should be unaffected.
    expect(checkRateLimit("key-b", 3, 1000).allowed).toBe(true);
    expect(checkRateLimit("key-a", 3, 1000).allowed).toBe(false);
  });

  it("resets the count once the window has elapsed", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("key-a", 3, 1000);
    expect(checkRateLimit("key-a", 3, 1000).allowed).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(checkRateLimit("key-a", 3, 1000).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  function reqWithHeaders(headers: Record<string, string>) {
    return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } };
  }

  it("uses the first entry of x-forwarded-for", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const req = reqWithHeaders({ "x-real-ip": "198.51.100.7" });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const req = reqWithHeaders({});
    expect(getClientIp(req)).toBe("unknown");
  });
});
