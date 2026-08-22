import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireAuth, scopedDepartmentWhere, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { studentSchema } from "@/lib/validations/student";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);

    const departmentIdParam = searchParams.get("departmentId");
    const level = searchParams.get("level");
    const paymentStatus = searchParams.get("paymentStatus");
    const search = searchParams.get("search");

    // scopedDepartmentWhere ignores departmentIdParam entirely for DEPARTMENT_ADMIN,
    // so a department admin can never read another department's students by
    // manipulating the query string.
    const where: any = {
      ...scopedDepartmentWhere(user, departmentIdParam),
      ...(level ? { level } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { referenceNumber: { contains: search, mode: "insensitive" } },
              { studentIndexNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    if (user.role === "DEPARTMENT_ADMIN" && !user.departmentId) {
      return NextResponse.json({ students: [] });
    }

    const students = await prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ students });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = studentSchema.parse(body);

    const departmentId = user.role === "SUPER_ADMIN" ? body.departmentId : user.departmentId;
    const academicSessionId = body.academicSessionId;

    if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    if (!academicSessionId) return NextResponse.json({ error: "academicSessionId is required" }, { status: 400 });

    if (user.role === "DEPARTMENT_ADMIN" && departmentId !== user.departmentId) {
      throw new ForbiddenError();
    }

    const duplicate = await prisma.student.findUnique({
      where: {
        departmentId_academicSessionId_referenceNumber: {
          departmentId,
          academicSessionId,
          referenceNumber: parsed.referenceNumber,
        },
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A student with this reference number already exists" }, { status: 409 });
    }

    const student = await prisma.student.create({
      data: {
        fullName: parsed.fullName,
        referenceNumber: parsed.referenceNumber,
        studentIndexNo: parsed.studentIndexNo || null,
        level: parsed.level,
        phone: parsed.phone,
        email: parsed.email || null,
        departmentId,
        academicSessionId,
      },
    });

    await logAudit({
      userId: user.id,
      departmentId,
      action: "STUDENT_CREATED",
      entity: "Student",
      entityId: student.id,
      metadata: { referenceNumber: student.referenceNumber },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  captureError(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
