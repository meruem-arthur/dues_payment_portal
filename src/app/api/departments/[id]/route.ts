import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

const LEVELS = ["L100", "L200", "L300", "L400", "L500", "L600"] as const;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDepartmentAccess(params.id);

    const department = await prisma.department.findUniqueOrThrow({
      where: { id: params.id },
      include: { paymentConfig: true },
    });

    const [totalStudents, paidStudents, collected, levelGroups] = await Promise.all([
      prisma.student.count({ where: { departmentId: params.id } }),
      prisma.student.count({ where: { departmentId: params.id, paymentStatus: "SUCCESS" } }),
      prisma.payment.aggregate({
        where: { departmentId: params.id, status: "SUCCESS" },
        _sum: { amount: true },
      }),
      prisma.student.groupBy({
        by: ["level", "paymentStatus"],
        where: { departmentId: params.id },
        _count: true,
      }),
    ]);

    // Reshape grouped rows into one entry per level with paid/unpaid counts,
    // in a fixed level order so the chart is stable regardless of DB order.
    const levelBreakdown = LEVELS.map((level) => {
      const rows = levelGroups.filter((g) => g.level === level);
      const paid = rows.find((r) => r.paymentStatus === "SUCCESS")?._count ?? 0;
      const unpaid = rows.reduce((sum, r) => (r.paymentStatus !== "SUCCESS" ? sum + r._count : sum), 0);
      return { level: level.replace("L", "Level "), paid, unpaid };
    }).filter((row) => row.paid + row.unpaid > 0);

    return NextResponse.json({
      department: { id: department.id, name: department.name, slug: department.slug },
      totalStudents,
      paidStudents,
      unpaidStudents: totalStudents - paidStudents,
      totalCollected: Number(collected._sum.amount ?? 0),
      paymentProvider: department.paymentConfig?.provider ?? "PAYSTACK",
      paymentEnvironment: department.paymentConfig?.environment ?? "TEST",
      levelBreakdown,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * PATCH: archive or restore a department. This replaces hard deletion.
 * Departments are financial-history-bearing records - payments, receipts,
 * and students belonging to one must remain queryable indefinitely for
 * audit purposes, so there is no DELETE handler here at all. Archiving
 * just flips a status flag: the department disappears from the active
 * lists/switchers used to accept new payments, but every record it owns
 * stays exactly where it is.
 *
 * Body: { action: "archive", confirmName: string } | { action: "restore" }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const action = body?.action;

    const department = await prisma.department.findUniqueOrThrow({ where: { id: params.id } });

    if (action === "archive") {
      if (department.status === "ARCHIVED") {
        return NextResponse.json({ error: "Department is already archived" }, { status: 409 });
      }
      if (body?.confirmName !== department.name) {
        return NextResponse.json({ error: "Confirmation text does not match the department name" }, { status: 400 });
      }

      const updated = await prisma.department.update({
        where: { id: params.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });

      await logAudit({
        userId: user.id,
        departmentId: department.id,
        action: "DEPARTMENT_ARCHIVED",
        entity: "Department",
        entityId: department.id,
        metadata: { name: department.name },
      });

      return NextResponse.json({ department: updated });
    }

    if (action === "restore") {
      if (department.status === "ACTIVE") {
        return NextResponse.json({ error: "Department is already active" }, { status: 409 });
      }

      const updated = await prisma.department.update({
        where: { id: params.id },
        data: { status: "ACTIVE", archivedAt: null },
      });

      await logAudit({
        userId: user.id,
        departmentId: department.id,
        action: "DEPARTMENT_RESTORED",
        entity: "Department",
        entityId: department.id,
        metadata: { name: department.name },
      });

      return NextResponse.json({ department: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
