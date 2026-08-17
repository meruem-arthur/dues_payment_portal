import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { academicSessionSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sessions = await prisma.academicSession.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { departments: true, students: true } } },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const parsed = academicSessionSchema.parse(body);

    const session = await prisma.academicSession.create({ data: parsed });

    await logAudit({
      userId: user.id,
      action: "ACADEMIC_SESSION_CREATED",
      entity: "AcademicSession",
      entityId: session.id,
      metadata: { name: session.name },
    });

    return NextResponse.json({ session }, { status: 201 });
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
