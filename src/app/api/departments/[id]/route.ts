import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { departmentLogoUpdateSchema } from "@/lib/validations/department";

// GET: single department lookup, scoped the same way the list endpoint is -
// SUPER_ADMIN can look up any department, DEPARTMENT_ADMIN only their own.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();

    const department = await prisma.department.findUnique({
      where: { id: params.id },
      include: {
        academicSession: true,
        _count: { select: { students: true, payments: true } },
      },
    });

    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    if (user.role !== "SUPER_ADMIN" && department.id !== user.departmentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ department });
  } catch (err) {
    return handleError(err);
  }
}

// PATCH: archive/restore a department. Only SUPER_ADMIN may do this - it's
// a system-wide lifecycle action, not something a department admin controls
// for their own department. Departments are never hard-deleted (see schema
// comment on Department.status) so this only ever flips status/archivedAt.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action !== "archive" && action !== "restore" && action !== "update_logo") {
      return NextResponse.json(
        { error: 'Invalid action - expected "archive", "restore" or "update_logo"' },
        { status: 400 }
      );
    }

    const department = await prisma.department.findUnique({ where: { id: params.id } });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    if (action === "update_logo") {
      const parsed = departmentLogoUpdateSchema.parse(body);
      const updated = await prisma.department.update({
        where: { id: params.id },
        data: { logoUrl: parsed.logoUrl },
      });

      await logAudit({
        userId: user.id,
        departmentId: updated.id,
        action: parsed.logoUrl ? "DEPARTMENT_LOGO_UPDATED" : "DEPARTMENT_LOGO_REMOVED",
        entity: "Department",
        entityId: updated.id,
        metadata: { name: updated.name },
      });

      return NextResponse.json({ department: updated });
    }

    if (action === "archive") {
      // Require the caller to retype the department name before archiving -
      // matches the confirmation dialog on the frontend, and re-checked here
      // rather than trusted purely client-side.
      const confirmName = body?.confirmName;
      if (confirmName !== department.name) {
        return NextResponse.json(
          { error: "Confirmation text did not match the department name" },
          { status: 400 }
        );
      }
      if (department.status === "ARCHIVED") {
        return NextResponse.json({ error: "Department is already archived" }, { status: 409 });
      }
    } else if (department.status === "ACTIVE") {
      return NextResponse.json({ error: "Department is not archived" }, { status: 409 });
    }

    const updated = await prisma.department.update({
      where: { id: params.id },
      data:
        action === "archive"
          ? { status: "ARCHIVED", archivedAt: new Date() }
          : { status: "ACTIVE", archivedAt: null },
    });

    await logAudit({
      userId: user.id,
      departmentId: updated.id,
      action: action === "archive" ? "DEPARTMENT_ARCHIVED" : "DEPARTMENT_RESTORED",
      entity: "Department",
      entityId: updated.id,
      metadata: { name: updated.name },
    });

    return NextResponse.json({ department: updated });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err && typeof err === "object" && "issues" in err) {
    return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
