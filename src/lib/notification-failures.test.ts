import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  getRecentNotificationFailures,
  resolveNotificationFailure,
  NOTIFICATION_FAILURE_WINDOW_MS,
} from "@/lib/notification-failures";
import type { SessionUser } from "@/lib/authorization";

const mockedPrisma = vi.mocked(prisma, true);

const superAdmin: SessionUser = {
  id: "user_super",
  name: "Super Admin",
  email: "super@umat.edu.gh",
  role: "SUPER_ADMIN",
  departmentId: null,
};

const deptAAdmin: SessionUser = {
  id: "user_dept_a",
  name: "Dept A Admin",
  email: "a@umat.edu.gh",
  role: "DEPARTMENT_ADMIN",
  departmentId: "dept_a",
};

const rawFailure = {
  id: "log_1",
  departmentId: "dept_a",
  department: { name: "Geomatic Engineering" },
  channel: "EMAIL",
  recipient: "student@example.com",
  status: "FAILED",
  errorMessage: "Brevo request failed - unauthorized: unrecognised IP",
  relatedPaymentId: "payment_1",
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.payment.findMany.mockResolvedValue([]);
});

describe("getRecentNotificationFailures", () => {
  it("queries only FAILED rows within the default 24h window", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([]);
    const before = Date.now();

    await getRecentNotificationFailures(superAdmin);

    const call = mockedPrisma.notificationLog.findMany.mock.calls[0][0] as any;
    expect(call.where.status).toBe("FAILED");
    expect(call.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(before - NOTIFICATION_FAILURE_WINDOW_MS - 1000);
    expect(call.where.createdAt.gte.getTime()).toBeLessThanOrEqual(before - NOTIFICATION_FAILURE_WINDOW_MS + 1000);
  });

  it("excludes resolved failures even within the window", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([]);
    await getRecentNotificationFailures(superAdmin);

    const call = mockedPrisma.notificationLog.findMany.mock.calls[0][0] as any;
    expect(call.where.resolvedAt).toBeNull();
  });

  it("SUPER_ADMIN gets no departmentId filter (sees every department)", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([]);
    await getRecentNotificationFailures(superAdmin);

    const call = mockedPrisma.notificationLog.findMany.mock.calls[0][0] as any;
    expect(call.where.departmentId).toBeUndefined();
  });

  it("DEPARTMENT_ADMIN is scoped to only their own department", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([]);
    await getRecentNotificationFailures(deptAAdmin);

    const call = mockedPrisma.notificationLog.findMany.mock.calls[0][0] as any;
    expect(call.where.departmentId).toBe("dept_a");
  });

  it("maps rows into the flat shape the UI consumes, including department name and reference number", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([rawFailure] as any);
    mockedPrisma.payment.findMany.mockResolvedValue([
      { id: "payment_1", student: { referenceNumber: "9012711322" } },
    ] as any);

    const result = await getRecentNotificationFailures(deptAAdmin);

    expect(result).toEqual([
      {
        id: "log_1",
        departmentId: "dept_a",
        departmentName: "Geomatic Engineering",
        channel: "EMAIL",
        recipient: "student@example.com",
        errorMessage: rawFailure.errorMessage,
        relatedPaymentId: "payment_1",
        studentReferenceNumber: "9012711322",
        createdAt: rawFailure.createdAt,
      },
    ]);
  });

  it("leaves studentReferenceNumber null when there's no related payment", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([
      { ...rawFailure, relatedPaymentId: null },
    ] as any);

    const result = await getRecentNotificationFailures(deptAAdmin);

    expect(result[0].studentReferenceNumber).toBeNull();
    expect(mockedPrisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("accepts a custom window", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([]);
    const oneHour = 60 * 60 * 1000;
    const before = Date.now();

    await getRecentNotificationFailures(superAdmin, oneHour);

    const call = mockedPrisma.notificationLog.findMany.mock.calls[0][0] as any;
    expect(call.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(before - oneHour - 1000);
  });
});

describe("resolveNotificationFailure", () => {
  it("returns false when the log doesn't exist", async () => {
    mockedPrisma.notificationLog.findUnique.mockResolvedValue(null);
    const result = await resolveNotificationFailure(superAdmin, "missing_log");
    expect(result).toBe(false);
    expect(mockedPrisma.notificationLog.update).not.toHaveBeenCalled();
  });

  it("lets SUPER_ADMIN resolve a failure in any department", async () => {
    mockedPrisma.notificationLog.findUnique.mockResolvedValue({ departmentId: "dept_a" } as any);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as any);

    const result = await resolveNotificationFailure(superAdmin, "log_1");

    expect(result).toBe(true);
    expect(mockedPrisma.notificationLog.update).toHaveBeenCalledWith({
      where: { id: "log_1" },
      data: expect.objectContaining({ resolvedBy: superAdmin.id }),
    });
  });

  it("lets a DEPARTMENT_ADMIN resolve a failure in their own department", async () => {
    mockedPrisma.notificationLog.findUnique.mockResolvedValue({ departmentId: "dept_a" } as any);
    mockedPrisma.notificationLog.update.mockResolvedValue({} as any);

    const result = await resolveNotificationFailure(deptAAdmin, "log_1");

    expect(result).toBe(true);
  });

  it("blocks a DEPARTMENT_ADMIN from resolving another department's failure", async () => {
    mockedPrisma.notificationLog.findUnique.mockResolvedValue({ departmentId: "dept_b" } as any);

    const result = await resolveNotificationFailure(deptAAdmin, "log_1");

    expect(result).toBe(false);
    expect(mockedPrisma.notificationLog.update).not.toHaveBeenCalled();
  });
});
