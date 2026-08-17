import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, UnauthorizedError, ForbiddenError } from "@/lib/authorization";

// GET /api/departments/[id]/stats
// Powers the live payment monitoring dashboard (DepartmentFilterDashboard).
// SUPER_ADMIN may request stats for any department; DEPARTMENT_ADMIN is
// restricted to their own department by requireDepartmentAccess.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDepartmentAccess(params.id);
    const departmentId = params.id;

    const [department, studentsByLevel, paymentStatusGroups, recentPayments, trendPayments] =
      await Promise.all([
        prisma.department.findUnique({
          where: { id: departmentId },
          select: { id: true, name: true, code: true, fresherAmount: true, continuingAmount: true },
        }),
        prisma.student.groupBy({
          by: ["level", "paymentStatus"],
          where: { departmentId },
          _count: { _all: true },
        }),
        prisma.payment.groupBy({
          by: ["status"],
          where: { departmentId },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.payment.findMany({
          where: { departmentId },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            amount: true,
            status: true,
            paymentType: true,
            paidAt: true,
            createdAt: true,
            student: { select: { fullName: true, referenceNumber: true } },
          },
        }),
        prisma.payment.findMany({
          where: {
            departmentId,
            status: "SUCCESS",
            paidAt: { gte: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000) },
          },
          select: { amount: true, paidAt: true },
        }),
      ]);

    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    // --- Student totals & level breakdown ---
    const levelMap = new Map<string, { total: number; paid: number; pending: number }>();
    for (const row of studentsByLevel) {
      const entry = levelMap.get(row.level) ?? { total: 0, paid: 0, pending: 0 };
      entry.total += row._count._all;
      if (row.paymentStatus === "SUCCESS") entry.paid += row._count._all;
      else if (row.paymentStatus === "PENDING") entry.pending += row._count._all;
      levelMap.set(row.level, entry);
    }
    const LEVEL_ORDER = ["L100", "L200", "L300", "L400", "L500", "L600"];
    const levelBreakdown = LEVEL_ORDER.filter((l) => levelMap.has(l)).map((level) => ({
      level,
      ...levelMap.get(level)!,
    }));

    const totalStudents = levelBreakdown.reduce((sum, l) => sum + l.total, 0);
    const paidStudents = levelBreakdown.reduce((sum, l) => sum + l.paid, 0);
    const pendingStudents = totalStudents - paidStudents;

    // L100 students are fresh admissions (billed at fresherAmount); every
    // other level is billed at continuingAmount. This mirrors how the
    // department setup form frames the two rates, since Student has no
    // separate paymentType field of its own.
    const fresherAmount = Number(department.fresherAmount);
    const continuingAmount = Number(department.continuingAmount);
    const expectedTotal = levelBreakdown.reduce((sum, l) => {
      const rate = l.level === "L100" ? fresherAmount : continuingAmount;
      return sum + l.total * rate;
    }, 0);

    // --- Payment status breakdown ---
    const STATUS_ORDER = ["SUCCESS", "PENDING", "FAILED", "CANCELLED", "REFUNDED"] as const;
    const paymentStatusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
      (typeof STATUS_ORDER)[number],
      number
    >;
    let totalCollected = 0;
    for (const row of paymentStatusGroups) {
      paymentStatusCounts[row.status as (typeof STATUS_ORDER)[number]] = row._count._all;
      if (row.status === "SUCCESS") totalCollected = Number(row._sum.amount ?? 0);
    }

    // --- 14-day collection trend (fills in zero-days so the chart doesn't skip) ---
    const trendMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      trendMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const p of trendPayments) {
      if (!p.paidAt) continue;
      const key = p.paidAt.toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.set(key, trendMap.get(key)! + Number(p.amount));
    }
    const trend = Array.from(trendMap.entries()).map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        fresherAmount,
        continuingAmount,
      },
      totals: { totalStudents, paidStudents, pendingStudents, totalCollected, expectedTotal },
      paymentStatusCounts,
      levelBreakdown,
      trend,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        studentName: p.student.fullName,
        referenceNumber: p.student.referenceNumber,
        amount: Number(p.amount),
        status: p.status,
        paymentType: p.paymentType,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
