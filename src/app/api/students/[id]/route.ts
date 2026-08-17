import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireDepartmentAccess, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { studentSchema } from "@/lib/validations/student";
import { logAudit } from "@/lib/audit";

// GET is used purely to populate the edit form. It performs NO mutation.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    const student = await prisma.student.findUniqueOrThrow({ where: { id: params.id } });
    await requireDepartmentAccess(student.departmentId);
    return NextResponse.json({ student });
  } catch (err) {
    return handleError(err);
  }
}

// PATCH is the ONLY operation that mutates a student record.
// The frontend must call this exclusively on "Save Changes", never on
// opening the edit dialog and never on "Cancel".
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.student.findUniqueOrThrow({ where: { id: params.id } });
    const user = await requireDepartmentAccess(existing.departmentId);

    const body = await req.json();
    const parsed = studentSchema.parse(body);

    if (parsed.referenceNumber !== existing.referenceNumber) {
      const duplicate = await prisma.student.findUnique({
        where: {
          departmentId_academicSessionId_referenceNumber: {
            departmentId: existing.departmentId,
            academicSessionId: existing.academicSessionId,
            referenceNumber: parsed.referenceNumber,
          },
        },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Another student already uses this reference number" }, { status: 409 });
      }
    }

    const student = await prisma.student.update({
      where: { id: params.id },
      data: {
        fullName: parsed.fullName,
        referenceNumber: parsed.referenceNumber,
        studentIndexNo: parsed.studentIndexNo || null,
        level: parsed.level,
        phone: parsed.phone,
        email: parsed.email || null,
      },
    });

    await logAudit({
      userId: user.id,
      departmentId: student.departmentId,
      action: "STUDENT_UPDATED",
      entity: "Student",
      entityId: student.id,
    });

    return NextResponse.json({ student });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await prisma.student.findUniqueOrThrow({ where: { id: params.id } });
    const user = await requireDepartmentAccess(existing.departmentId);

    await prisma.student.delete({ where: { id: params.id } });

    await logAudit({
      userId: user.id,
      departmentId: existing.departmentId,
      action: "STUDENT_DELETED",
      entity: "Student",
      entityId: params.id,
      metadata: { referenceNumber: existing.referenceNumber },
    });

    return NextResponse.json({ success: true });
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
