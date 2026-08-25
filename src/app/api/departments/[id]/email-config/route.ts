import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { emailConfigUpdateSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";

// Email receipt settings for an already-created department. Unlike
// sms-config/route.ts, there's no per-department secret here to encrypt -
// email sending uses ONE account-wide EMAIL_API_KEY (see
// src/lib/email/brevo.provider.ts) - this route only ever touches
// fromAddress/emailTemplate/enabled.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin();

    const department = await prisma.department.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const config = await prisma.emailConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    return NextResponse.json({
      config: config
        ? {
            fromAddress: config.fromAddress ?? "",
            emailTemplate: config.emailTemplate,
            enabled: config.enabled,
            updatedAt: config.updatedAt,
          }
        : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const parsed = emailConfigUpdateSchema.parse(body);

    const department = await prisma.department.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const existing = await prisma.emailConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    const data = {
      // An explicit "" clears back to the EMAIL_FROM_ADDRESS account-wide
      // fallback (see brevo.provider.ts) - undefined means "leave as is".
      fromAddress: parsed.fromAddress !== undefined ? (parsed.fromAddress || null) : existing?.fromAddress ?? null,
      emailTemplate: parsed.emailTemplate ?? existing?.emailTemplate,
      enabled: parsed.enabled ?? existing?.enabled ?? false,
    };

    const config = await prisma.emailConfiguration.upsert({
      where: { departmentId: params.id },
      create: { departmentId: params.id, ...data },
      update: data,
    });

    await logAudit({
      userId: user.id,
      departmentId: params.id,
      action: "EMAIL_CONFIG_UPDATED",
      entity: "EmailConfiguration",
      entityId: config.id,
      metadata: { fromAddress: config.fromAddress, enabled: config.enabled },
    });

    return NextResponse.json({
      config: {
        fromAddress: config.fromAddress ?? "",
        emailTemplate: config.emailTemplate,
        enabled: config.enabled,
        updatedAt: config.updatedAt,
      },
    });
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
  captureError(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
