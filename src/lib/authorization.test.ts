import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import {
  getCurrentUser,
  requireAuth,
  requireSuperAdmin,
  requireDepartmentAccess,
  scopedDepartmentWhere,
  UnauthorizedError,
  ForbiddenError,
  type SessionUser,
} from "@/lib/authorization";

const mockedGetServerSession = vi.mocked(getServerSession);

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

function sessionFor(user: SessionUser | null) {
  return user ? { user } : null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser / requireAuth", () => {
  it("returns null when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(null) as any);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the session user when authenticated", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(deptAAdmin) as any);
    expect(await getCurrentUser()).toEqual(deptAAdmin);
  });

  it("requireAuth throws UnauthorizedError when unauthenticated", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(null) as any);
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requireAuth returns the user when authenticated", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(deptAAdmin) as any);
    await expect(requireAuth()).resolves.toEqual(deptAAdmin);
  });
});

describe("requireSuperAdmin", () => {
  it("throws ForbiddenError for a DEPARTMENT_ADMIN", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(deptAAdmin) as any);
    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws UnauthorizedError when unauthenticated (checked before role)", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(null) as any);
    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allows a SUPER_ADMIN through", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(superAdmin) as any);
    await expect(requireSuperAdmin()).resolves.toEqual(superAdmin);
  });
});

describe("requireDepartmentAccess - the core multi-tenant boundary", () => {
  it("SUPER_ADMIN may access any department", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(superAdmin) as any);
    await expect(requireDepartmentAccess("dept_a")).resolves.toEqual(superAdmin);
    await expect(requireDepartmentAccess("dept_b")).resolves.toEqual(superAdmin);
    await expect(requireDepartmentAccess("some_department_that_does_not_exist")).resolves.toEqual(superAdmin);
  });

  it("DEPARTMENT_ADMIN may access their own department", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(deptAAdmin) as any);
    await expect(requireDepartmentAccess("dept_a")).resolves.toEqual(deptAAdmin);
  });

  it("DEPARTMENT_ADMIN is REJECTED for a different department (cross-tenant boundary)", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(deptAAdmin) as any);
    await expect(requireDepartmentAccess("dept_b")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("DEPARTMENT_ADMIN with no assigned department is rejected for every department", async () => {
    const orphanAdmin: SessionUser = { ...deptAAdmin, departmentId: null };
    mockedGetServerSession.mockResolvedValue(sessionFor(orphanAdmin) as any);
    await expect(requireDepartmentAccess("dept_a")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws UnauthorizedError (not ForbiddenError) when unauthenticated", async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(null) as any);
    await expect(requireDepartmentAccess("dept_a")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("scopedDepartmentWhere - query scoping helper", () => {
  it("SUPER_ADMIN with no requested department sees everything (empty where)", () => {
    expect(scopedDepartmentWhere(superAdmin)).toEqual({});
  });

  it("SUPER_ADMIN with a requested department is filtered to it", () => {
    expect(scopedDepartmentWhere(superAdmin, "dept_b")).toEqual({ departmentId: "dept_b" });
  });

  it("DEPARTMENT_ADMIN is always pinned to their own department, regardless of what's requested", () => {
    expect(scopedDepartmentWhere(deptAAdmin, "dept_b")).toEqual({ departmentId: "dept_a" });
  });

  it("DEPARTMENT_ADMIN ignores an absent requested department too and still uses their own", () => {
    expect(scopedDepartmentWhere(deptAAdmin, null)).toEqual({ departmentId: "dept_a" });
    expect(scopedDepartmentWhere(deptAAdmin)).toEqual({ departmentId: "dept_a" });
  });
});
