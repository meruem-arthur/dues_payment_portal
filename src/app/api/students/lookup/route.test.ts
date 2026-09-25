import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    student: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { __resetRateLimitStateForTests } from "@/lib/rate-limit";
import { POST } from "./route";

const mockedPrisma = vi.mocked(prisma, true);

const baseDepartment = {
  id: "dept_1",
  slug: "ceramic-eng",
  status: "ACTIVE",
  academicSessionId: "session_1",
};

const baseStudent = {
  fullName: "Kwame Mensah",
  level: "L300",
  paymentStatus: "PENDING",
};

function makeRequest(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost/api/students/lookup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const validBody = {
  departmentSlug: "ceramic-eng",
  paymentType: "CONTINUING",
  referenceNumber: "REF001",
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitStateForTests();

  mockedPrisma.department.findUnique.mockResolvedValue(baseDepartment as any);
  mockedPrisma.student.findFirst.mockResolvedValue(baseStudent as any);
});

describe("POST /api/students/lookup", () => {
  it("returns the student's name for a valid continuing reference number", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.fullName).toBe("Kwame Mensah");
  });

  it("returns 404 when no student matches the reference number", async () => {
    mockedPrisma.student.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the department does not exist", async () => {
    mockedPrisma.department.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 410 for an archived department", async () => {
    mockedPrisma.department.findUnique.mockResolvedValue({ ...baseDepartment, status: "ARCHIVED" } as any);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(410);
  });

  it("rejects a Level 100 student looked up on the Continuing link", async () => {
    mockedPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, level: "L100" } as any);

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/level 100/i);
  });

  it("rejects a continuing student looked up on the Fresher link", async () => {
    const res = await POST(makeRequest({ ...validBody, paymentType: "FRESHER" }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/continuing student/i);
  });

  it("rejects a student who has already paid", async () => {
    mockedPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, paymentStatus: "SUCCESS" } as any);

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already paid/i);
  });

  it("rate-limits repeated requests from the same IP", async () => {
    const ip = "10.0.0.99";
    for (let i = 0; i < 8; i++) {
      const res = await POST(makeRequest(validBody, ip));
      expect(res.status).toBe(200);
    }
    const blocked = await POST(makeRequest(validBody, ip));
    const data = await blocked.json();
    expect(blocked.status).toBe(429);
    expect(data.error).toMatch(/too many/i);
  });
});
