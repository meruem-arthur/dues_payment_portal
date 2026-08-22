import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/email/provider-factory", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getEmailProvider } from "@/lib/email/provider-factory";
import { __resetRateLimitStateForTests } from "@/lib/rate-limit";
import { POST } from "./route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetEmailProvider = vi.mocked(getEmailProvider);

const activeUser = {
  id: "user_1",
  name: "Ama Owusu",
  email: "ama@umat.edu.gh",
  status: "ACTIVE",
};

function makeRequest(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

let emailSend: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStateForTests();

  mockedPrisma.user.findUnique.mockResolvedValue(activeUser as any);
  mockedPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 } as any);
  mockedPrisma.passwordResetToken.create.mockResolvedValue({ id: "token_1" } as any);

  emailSend = vi.fn().mockResolvedValue({ success: true });
  mockedGetEmailProvider.mockReturnValue({ send: emailSend } as any);
});

describe("POST /api/auth/forgot-password", () => {
  it("issues a token and emails a reset link for a known, active account", async () => {
    const res = await POST(makeRequest({ email: "ama@umat.edu.gh" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/if an account exists/i);
    expect(mockedPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(emailSend).toHaveBeenCalledTimes(1);
    const [sentEmail] = emailSend.mock.calls[0];
    expect(sentEmail.to).toBe("ama@umat.edu.gh");
    expect(sentEmail.body).toContain("/reset-password?token=");
  });

  it("invalidates previously issued unused tokens before creating a new one", async () => {
    await POST(makeRequest({ email: "ama@umat.edu.gh" }));

    expect(mockedPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("returns the exact same generic response for an unknown email (no enumeration)", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "nobody@umat.edu.gh" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/if an account exists/i);
    expect(mockedPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("returns the same generic response for a non-ACTIVE account", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ ...activeUser, status: "SUSPENDED" } as any);

    const res = await POST(makeRequest({ email: "ama@umat.edu.gh" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toMatch(/if an account exists/i);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("rate-limits repeated requests from the same IP", async () => {
    const ip = "10.0.0.99";
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest({ email: "ama@umat.edu.gh" }, ip));
      expect(res.status).toBe(200);
    }
    const blocked = await POST(makeRequest({ email: "ama@umat.edu.gh" }, ip));
    const data = await blocked.json();
    expect(blocked.status).toBe(429);
    expect(data.error).toMatch(/too many/i);
  });
});
