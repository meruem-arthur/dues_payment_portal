import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { getRecentNotificationFailures, NOTIFICATION_FAILURE_WINDOW_MS } from "@/lib/notification-failures";
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

  it("maps rows into the flat shape the UI consumes, including department name", async () => {
    mockedPrisma.notificationLog.findMany.mockResolvedValue([rawFailure] as any);

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
        createdAt: rawFailure.createdAt,
      },
    ]);
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
