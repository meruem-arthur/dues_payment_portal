import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { departmentSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";

// GET: Super admin sees all departments. Department admin sees only their own (still useful for the switcher UI check).
export async function GET() {
  try {
    const user = await requireAuth();

    const departments = await prisma.department.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { id: user.departmentId ?? "__none__" },
      include: {
        academicSession: true,
        _count: { select: { students: true, payments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ departments });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const parsed = departmentSchema.parse(body);

    const existingSlug = await prisma.department.findUnique({ where: { slug: parsed.slug } });
    if (existingSlug) {
      return NextResponse.json({ error: "That slug is already in use by another department" }, { status: 409 });
    }

    const department = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          name: parsed.name,
          code: parsed.code,
          slug: parsed.slug,
          description: parsed.description,
          academicSessionId: parsed.academicSessionId,
          fresherAmount: parsed.fresherAmount,
          continuingAmount: parsed.continuingAmount,
          contactEmail: parsed.contactEmail || null,
          contactPhone: parsed.contactPhone || null,
        },
      });

      // Every department gets default (empty/test) provider configs it can fill in later.
      await tx.paymentProviderConfiguration.create({
        data: { departmentId: dept.id, provider: "PAYSTACK", environment: "TEST" },
      });
      await tx.smsConfiguration.create({
        data: { departmentId: dept.id, senderId: parsed.code.toUpperCase().slice(0, 11) },
      });
      await tx.emailConfiguration.create({ data: { departmentId: dept.id } });

      return dept;
    });

    await logAudit({
      userId: user.id,
      departmentId: department.id,
      action: "DEPARTMENT_CREATED",
      entity: "Department",
      entityId: department.id,
      metadata: { name: department.name },
    });

    return NextResponse.json({ department }, { status: 201 });
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
