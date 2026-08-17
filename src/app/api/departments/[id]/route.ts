import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, UnauthorizedError, ForbiddenError } from "@/lib/authorization";

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
