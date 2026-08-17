import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { academicSessionSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const parsed = academicSessionSchema.partial().parse(body);

    const session = await prisma.academicSession.update({
      where: { id: params.id },
      data: parsed,
    });

    await logAudit({ userId: user.id, action: "ACADEMIC_SESSION_UPDATED", entity: "AcademicSession", entityId: session.id });

    return NextResponse.json({ session });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();

    // Highly destructive - require explicit confirmation token in body matching the session name,
    // enforced client-side too, but re-checked here since this is the authoritative boundary.
    const body = await req.json().catch(() => ({}));
    const existing = await prisma.academicSession.findUniqueOrThrow({ where: { id: params.id } });

    if (body.confirmName !== existing.name) {
      return NextResponse.json(
        { error: "Confirmation text does not match the academic session name" },
        { status: 400 }
      );
    }

    await prisma.academicSession.delete({ where: { id: params.id } });

    await logAudit({ userId: user.id, action: "ACADEMIC_SESSION_DELETED", entity: "AcademicSession", entityId: params.id });

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
