import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { __resetRateLimitStateForTests } from "@/lib/rate-limit";
import { authOptions } from "@/lib/auth";

const mockedPrisma = vi.mocked(prisma, true);
const mockedCompare = vi.mocked(bcrypt.compare);

// CredentialsProvider(options) wraps the authorize you pass under
// `.options.authorize` (its own top-level `.authorize` is a stub) - see
// node_modules/next-auth/providers/credentials.js.
const authorize = (authOptions.providers[0] as any).options.authorize as (
  credentials: { email?: string; password?: string } | undefined,
  req: { headers?: Record<string, string> }
) => Promise<unknown>;

const activeUser = {
  id: "user_1",
  name: "Ama Owusu",
  email: "ama@umat.edu.gh",
  passwordHash: "hashed",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  departmentId: null,
};

function reqFromIp(ip: string) {
  return { headers: { "x-forwarded-for": ip } };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStateForTests();
  mockedPrisma.user.findUnique.mockResolvedValue(activeUser as any);
  mockedCompare.mockResolvedValue(true as any);
});

describe("authorize()", () => {
  it("returns the user on valid credentials", async () => {
    const result = await authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp("10.0.0.1"));
    expect(result).toEqual(expect.objectContaining({ id: "user_1", email: "ama@umat.edu.gh" }));
  });

  it("returns null on wrong password", async () => {
    mockedCompare.mockResolvedValue(false as any);
    const result = await authorize({ email: "ama@umat.edu.gh", password: "wrong" }, reqFromIp("10.0.0.2"));
    expect(result).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);
    const result = await authorize({ email: "nobody@umat.edu.gh", password: "x" }, reqFromIp("10.0.0.3"));
    expect(result).toBeNull();
  });

  it("returns null for a non-ACTIVE account even with the right password", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ ...activeUser, status: "SUSPENDED" } as any);
    const result = await authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp("10.0.0.4"));
    expect(result).toBeNull();
  });

  it("throws a rate-limit error after 5 attempts from the same IP within the window", async () => {
    const ip = "10.0.0.5";
    for (let i = 0; i < 5; i++) {
      await authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp(ip));
    }
    await expect(authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp(ip))).rejects.toThrow(
      /too many login attempts/i
    );
  });

  it("does not rate-limit across different IPs", async () => {
    for (let i = 0; i < 5; i++) {
      await authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp("10.0.0.6"));
    }
    // A 6th attempt from a different IP should still be allowed through to
    // the normal credential check, not blocked by the first IP's bucket.
    const result = await authorize({ email: "ama@umat.edu.gh", password: "correct-password" }, reqFromIp("10.0.0.7"));
    expect(result).toEqual(expect.objectContaining({ id: "user_1" }));
  });

  it("counts failed attempts toward the rate limit too, not just successful ones", async () => {
    mockedCompare.mockResolvedValue(false as any);
    const ip = "10.0.0.8";
    for (let i = 0; i < 5; i++) {
      await authorize({ email: "ama@umat.edu.gh", password: "wrong" }, reqFromIp(ip));
    }
    await expect(authorize({ email: "ama@umat.edu.gh", password: "wrong" }, reqFromIp(ip))).rejects.toThrow(/too many/i);
  });
});
