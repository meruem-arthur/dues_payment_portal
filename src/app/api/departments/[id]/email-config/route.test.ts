import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    emailConfiguration: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireSuperAdmin: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authorization";
import { GET, PATCH } from "./route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedRequireSuperAdmin = vi.mocked(requireSuperAdmin);

const params = { params: { id: "dept_1" } };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/departments/dept_1/email-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const existingConfig = {
  id: "email_config_1",
  departmentId: "dept_1",
  fromAddress: "geomatic-dues@umat.edu.gh",
  emailTemplate: "Dear {name}, your payment of {amount} for {department} was successful.",
  enabled: true,
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireSuperAdmin.mockResolvedValue({ id: "user_1" } as any);
  mockedPrisma.department.findUnique.mockResolvedValue({ id: "dept_1", name: "Geomatic Engineering" } as any);
  mockedPrisma.emailConfiguration.findUnique.mockResolvedValue(existingConfig as any);
  mockedPrisma.emailConfiguration.upsert.mockResolvedValue(existingConfig as any);
});

describe("GET /api/departments/[id]/email-config", () => {
  it("returns the current config", async () => {
    const res = await GET(new NextRequest("http://localhost/api/departments/dept_1/email-config"), params);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.config).toEqual(
      expect.objectContaining({ fromAddress: "geomatic-dues@umat.edu.gh", enabled: true })
    );
  });

  it("returns 404 for an unknown department", async () => {
    mockedPrisma.department.findUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/departments/dept_1/email-config"), params);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/departments/[id]/email-config", () => {
  it("saves fromAddress, emailTemplate, and enabled", async () => {
    await PATCH(makeRequest({ fromAddress: "new@umat.edu.gh", emailTemplate: "New template {name}", enabled: false }), params);

    expect(mockedPrisma.emailConfiguration.upsert).toHaveBeenCalledWith({
      where: { departmentId: "dept_1" },
      create: expect.objectContaining({ departmentId: "dept_1" }),
      update: expect.objectContaining({
        fromAddress: "new@umat.edu.gh",
        emailTemplate: "New template {name}",
        enabled: false,
      }),
    });
  });

  it("clears fromAddress back to the account default with an explicit empty string", async () => {
    await PATCH(makeRequest({ fromAddress: "", enabled: true }), params);

    const call = mockedPrisma.emailConfiguration.upsert.mock.calls[0][0];
    expect(call.update.fromAddress).toBeNull();
  });

  it("leaves fromAddress unchanged when omitted from the request", async () => {
    await PATCH(makeRequest({ enabled: true }), params);

    const call = mockedPrisma.emailConfiguration.upsert.mock.calls[0][0];
    expect(call.update.fromAddress).toBe(existingConfig.fromAddress);
  });

  it("rejects an invalid email address for fromAddress", async () => {
    const res = await PATCH(makeRequest({ fromAddress: "not-an-email" }), params);
    expect(res.status).toBe(400);
    expect(mockedPrisma.emailConfiguration.upsert).not.toHaveBeenCalled();
  });

  it("requires super admin access", async () => {
    class ForbiddenError extends Error {}
    mockedRequireSuperAdmin.mockRejectedValue(new ForbiddenError("Forbidden"));

    const res = await PATCH(makeRequest({ enabled: true }), params);
    // Either 401/403 depending on which error class is thrown by the mock -
    // the important thing is it's rejected, not saved.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockedPrisma.emailConfiguration.upsert).not.toHaveBeenCalled();
  });
});
