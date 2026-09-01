import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn().mockResolvedValue("new_hashed_password") },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { __resetRateLimitStateForTests } from "@/lib/rate-limit";
import { POST } from "./route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetServerSession = vi.mocked(getServerSession);
const mockedCompare = vi.mocked(bcrypt.compare);

const sessionUser = {
  id: "user_1",
  name: "Ama Owusu",
  email: "ama@umat.edu.gh",
  role: "DEPARTMENT_ADMIN",
  departmentId: "dept_a",
};

const dbUser = {
  id: "user_1",
  name: "Ama Owusu",
  email: "ama@umat.edu.gh",
  passwordHash: "old_hashed_password",
  role: "DEPARTMENT_ADMIN",
  status: "ACTIVE",
  departmentId: "dept_a",
};

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStateForTests();
  mockedGetServerSession.mockResolvedValue({ user: sessionUser } as any);
  mockedPrisma.user.findUnique.mockResolvedValue(dbUser as any);
});

describe("POST /api/auth/change-password", () => {
  it("rejects an unauthenticated request", async () => {
    mockedGetServerSession.mockResolvedValue(null as any);
    const res = await POST(makeRequest({ currentPassword: "old-pass-123", newPassword: "new-pass-456" }));
    expect(res.status).toBe(401);
  });

  it("rejects when the current password is wrong", async () => {
    mockedCompare.mockResolvedValue(false as any);
    const res = await POST(makeRequest({ currentPassword: "wrong-pass", newPassword: "new-pass-456" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/incorrect/i);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects when the new password matches the current password", async () => {
    mockedCompare.mockResolvedValue(true as any);
    const res = await POST(makeRequest({ currentPassword: "same-pass-123", newPassword: "same-pass-123" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/different/i);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    mockedCompare.mockResolvedValue(true as any);
    const res = await POST(makeRequest({ currentPassword: "old-pass-123", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it("updates the password hash and logs an audit entry on success", async () => {
    mockedCompare.mockResolvedValue(true as any);
    const res = await POST(makeRequest({ currentPassword: "old-pass-123", newPassword: "brand-new-password" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/updated/i);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { passwordHash: "new_hashed_password" },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", action: "PASSWORD_CHANGED", entity: "User" })
    );
  });

  it("rate limits repeated attempts for the same user", async () => {
    mockedCompare.mockResolvedValue(false as any);
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ currentPassword: "wrong", newPassword: "new-pass-456" }));
    }
    const res = await POST(makeRequest({ currentPassword: "wrong", newPassword: "new-pass-456" }));
    expect(res.status).toBe(429);
  });
});
