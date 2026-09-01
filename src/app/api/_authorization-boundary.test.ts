import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * These tests exist for one reason: prove that a DEPARTMENT_ADMIN for one
 * department can never read, write, or infer anything about another
 * department - regardless of what IDs they pass in the URL or body.
 *
 * Unlike src/lib/authorization.test.ts (which unit-tests the guard
 * functions in isolation), these call the REAL route handlers end-to-end,
 * so a route that forgets to call the guard at all would be caught here
 * even though authorization.ts itself is working perfectly.
 *
 * Convention: "dept_a" is the authenticated admin's own department,
 * "dept_b" is a different department they must never be able to touch.
 *
 * Route handlers are imported statically (not per-test dynamic import) so
 * Next.js's route compilation cost is paid once at module load / collection
 * time, not inside any single test's timeout window.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    department: { findUnique: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { GET as getStudent, PATCH as patchStudent, DELETE as deleteStudent } from "@/app/api/students/[id]/route";
import { POST as postStudent } from "@/app/api/students/route";
import { POST as postCsvUpload } from "@/app/api/students/csv-upload/route";
import { GET as getDepartmentStats } from "@/app/api/departments/[id]/stats/route";
import { GET as getDepartment } from "@/app/api/departments/[id]/route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetServerSession = vi.mocked(getServerSession);

const deptAAdmin = {
  id: "user_dept_a",
  name: "Dept A Admin",
  email: "a@umat.edu.gh",
  role: "DEPARTMENT_ADMIN" as const,
  departmentId: "dept_a",
};

function asDeptAAdmin() {
  mockedGetServerSession.mockResolvedValue({ user: deptAAdmin } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET/PATCH/DELETE /api/students/[id] - cross-department", () => {
  const foreignStudent = {
    id: "student_1",
    departmentId: "dept_b",
    academicSessionId: "session_1",
    referenceNumber: "REF-1",
    fullName: "Someone Else",
  };

  it("GET rejects a student belonging to a different department", async () => {
    asDeptAAdmin();
    mockedPrisma.student.findUniqueOrThrow.mockResolvedValue(foreignStudent as any);

    const res = await getStudent(new NextRequest("http://localhost/api/students/student_1"), { params: { id: "student_1" } });
    expect(res.status).toBe(403);
  });

  it("PATCH rejects updating a student belonging to a different department", async () => {
    asDeptAAdmin();
    mockedPrisma.student.findUniqueOrThrow.mockResolvedValue(foreignStudent as any);

    const req = new NextRequest("http://localhost/api/students/student_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Hijacked Name", referenceNumber: "REF-1", level: "L100", phone: "0501234567" }),
    });
    const res = await patchStudent(req, { params: { id: "student_1" } });
    expect(res.status).toBe(403);
    expect(mockedPrisma.student.update).not.toHaveBeenCalled();
  });

  it("DELETE rejects deleting a student belonging to a different department", async () => {
    asDeptAAdmin();
    mockedPrisma.student.findUniqueOrThrow.mockResolvedValue(foreignStudent as any);

    const res = await deleteStudent(new NextRequest("http://localhost/api/students/student_1", { method: "DELETE" }), {
      params: { id: "student_1" },
    });
    expect(res.status).toBe(403);
    expect(mockedPrisma.student.delete).not.toHaveBeenCalled();
  });
});

describe("GET /api/departments/[id]/stats - cross-department", () => {
  it("rejects a DEPARTMENT_ADMIN requesting another department's stats", async () => {
    asDeptAAdmin();

    const res = await getDepartmentStats(new NextRequest("http://localhost/api/departments/dept_b/stats"), { params: { id: "dept_b" } });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/departments/[id] - cross-department", () => {
  it("rejects a DEPARTMENT_ADMIN looking up another department", async () => {
    asDeptAAdmin();
    mockedPrisma.department.findUnique.mockResolvedValue({ id: "dept_b", name: "Other Department" } as any);

    const res = await getDepartment(new NextRequest("http://localhost/api/departments/dept_b"), { params: { id: "dept_b" } });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/students - departmentId smuggling on create", () => {
  it("ignores a foreign departmentId in the body and scopes the created student to the admin's own department", async () => {
    asDeptAAdmin();
    mockedPrisma.student.findUnique.mockResolvedValue(null); // no duplicate
    mockedPrisma.student.create.mockResolvedValue({ id: "student_new", departmentId: "dept_a" } as any);

    const req = new NextRequest("http://localhost/api/students", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "New Student",
        referenceNumber: "REF-NEW",
        level: "L100",
        phone: "0501234567",
        departmentId: "dept_b", // attempted smuggling - must be ignored
        academicSessionId: "session_1",
      }),
    });

    const res = await postStudent(req);
    expect(res.status).toBe(201);
    expect(mockedPrisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept_a" }) })
    );
  });
});

describe("POST /api/students/csv-upload - departmentId smuggling on bulk create", () => {
  it("ignores a foreign departmentId in the body and previews against the admin's own department only", async () => {
    asDeptAAdmin();
    mockedPrisma.student.findMany.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/students/csv-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csvText: "name,reference_number,level,phone\nJane Doe,REF-1,L100,0501234567",
        departmentId: "dept_b", // attempted smuggling - must be ignored
        academicSessionId: "session_1",
        dryRun: true,
      }),
    });

    const res = await postCsvUpload(req);
    expect(res.status).toBe(200);
    expect(mockedPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ departmentId: "dept_a" }) })
    );
    const data = await res.clone().json();
    expect(data.validRows?.[0]?.departmentId).toBe("dept_a");
  });
});
