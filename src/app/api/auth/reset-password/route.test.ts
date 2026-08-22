import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: { findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("new_hashed_password") },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { __resetRateLimitStateForTests } from "@/lib/rate-limit";
import { POST } from "./route";

const mockedPrisma = vi.mocked(prisma, true);

const RAW_TOKEN = "a".repeat(64);
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

function makeRequest(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const validToken = {
  id: "reset_token_1",
  userId: "user_1",
  tokenHash: TOKEN_HASH,
  usedAt: null,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
  user: { id: "user_1", email: "ama@umat.edu.gh" },
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStateForTests();

  mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(validToken as any);
  mockedPrisma.$transaction.mockResolvedValue([{}, {}] as any);
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password with a valid, unexpired, unused token", async () => {
    const res = await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/password updated/i);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("looks the token up by its SHA-256 hash, never the raw value", async () => {
    await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }));
    expect(mockedPrisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      include: { user: true },
    });
  });

  it("rejects an unknown token", async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid or has expired/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      ...validToken,
      expiresAt: new Date(Date.now() - 1000),
    } as any);

    const res = await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }));
    expect(res.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a token that has already been used", async () => {
    mockedPrisma.passwordResetToken.findUnique.mockResolvedValue({
      ...validToken,
      usedAt: new Date(),
    } as any);

    const res = await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }));
    expect(res.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(makeRequest({ token: RAW_TOKEN, password: "short" }));
    expect(res.status).toBe(400);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rate-limits repeated requests from the same IP", async () => {
    const ip = "10.0.0.88";
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }, ip));
    }
    const blocked = await POST(makeRequest({ token: RAW_TOKEN, password: "brand-new-password" }, ip));
    const data = await blocked.json();
    expect(blocked.status).toBe(429);
    expect(data.error).toMatch(/too many/i);
  });
});
