import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { PATCH } from "./route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedRequireSuperAdmin = vi.mocked(requireSuperAdmin);
const mockedLogAudit = vi.mocked(logAudit);

const params = { params: { id: "dept_1" } };
const existingDepartment = { id: "dept_1", name: "Geomatic Engineering", status: "ACTIVE" };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/departments/dept_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireSuperAdmin.mockResolvedValue({ id: "user_1" } as any);
  mockedPrisma.department.findUnique.mockResolvedValue(existingDepartment as any);
});

describe("PATCH /api/departments/[id] - update_receipt_branding", () => {
  it("saves stamp, signatures and names", async () => {
    const updated = { ...existingDepartment, stampUrl: tinyPng, financialSecretaryName: "Ama Boateng" };
    mockedPrisma.department.update.mockResolvedValue(updated as any);

    const res = await PATCH(
      makeRequest({
        action: "update_receipt_branding",
        stampUrl: tinyPng,
        financialSecretaryName: "Ama Boateng",
        financialSecretarySignatureUrl: tinyPng,
        presidentName: "Kwame Owusu",
        presidentSignatureUrl: tinyPng,
      }),
      params
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockedPrisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dept_1" },
        data: expect.objectContaining({
          stampUrl: tinyPng,
          financialSecretaryName: "Ama Boateng",
          presidentName: "Kwame Owusu",
        }),
      })
    );
    expect(mockedLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEPARTMENT_RECEIPT_BRANDING_UPDATED" })
    );
    expect(data.department.stampUrl).toBe(tinyPng);
  });

  it("allows clearing a single field with an explicit null, leaving others untouched", async () => {
    mockedPrisma.department.update.mockResolvedValue(existingDepartment as any);

    const res = await PATCH(makeRequest({ action: "update_receipt_branding", stampUrl: null }), params);

    expect(res.status).toBe(200);
    expect(mockedPrisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stampUrl: null } })
    );
  });

  it("rejects a non-image value", async () => {
    const res = await PATCH(
      makeRequest({ action: "update_receipt_branding", stampUrl: "not-an-image" }),
      params
    );
    expect(res.status).toBe(400);
    expect(mockedPrisma.department.update).not.toHaveBeenCalled();
  });

  it("404s when the department does not exist", async () => {
    mockedPrisma.department.findUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ action: "update_receipt_branding" }), params);
    expect(res.status).toBe(404);
  });
});
