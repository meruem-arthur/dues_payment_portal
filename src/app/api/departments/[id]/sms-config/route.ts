import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { smsConfigUpdateSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/field-encryption";

// SMS credentials (Africa's Talking apiKey/username) for an already-created
// department. Mirrors payment-config/route.ts: departments/route.ts only
// ever creates a SmsConfiguration row with default senderId/messageTemplate
// at department-creation time - the real apiKey/username are added or
// rotated here, and only SUPER_ADMIN may read or write them.

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

    const config = await prisma.smsConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    // apiKey is never sent to the client - only whether it's set, so the
    // frontend can show "API key is set - leave blank to keep it".
    return NextResponse.json({
      config: config
        ? {
            senderId: config.senderId,
            messageTemplate: config.messageTemplate,
            username: config.username ?? "",
            hasApiKey: Boolean(config.apiKey),
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
    const parsed = smsConfigUpdateSchema.parse(body);

    const department = await prisma.department.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    // Same convention as payment-config: a blank apiKey means "leave it
    // as it is", not "clear it" - it's never sent back to the client so
    // re-saving the form without retyping it must not wipe it out.
    // apiKey is encrypted at rest (see field-encryption.ts) - only a
    // freshly-submitted plaintext value gets encrypted here.
    const secretIfProvided = (v: string | undefined) => (v ? v : undefined);
    const encryptedSecretIfProvided = (v: string | undefined) => (v ? encryptSecret(v) : undefined);

    const existing = await prisma.smsConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    const data = {
      // No fallback like "UMAT" here - an unapproved/unregistered sender id
      // gets rejected by Africa's Talking (this bit us on the election
      // system). Leaving it empty means the provider omits "from" entirely
      // and AT uses the account's own default sender instead.
      senderId: parsed.senderId ?? existing?.senderId ?? "",
      messageTemplate: parsed.messageTemplate ?? existing?.messageTemplate,
      username: parsed.username !== undefined ? parsed.username : existing?.username ?? null,
      apiKey: encryptedSecretIfProvided(parsed.apiKey) ?? existing?.apiKey ?? null,
      enabled: parsed.enabled ?? existing?.enabled ?? true,
    };

    const config = await prisma.smsConfiguration.upsert({
      where: { departmentId: params.id },
      create: { departmentId: params.id, ...data },
      update: data,
    });

    // Never write the apiKey value itself into the audit log - only
    // whether it changed, same as secretKey on the payment config route.
    await logAudit({
      userId: user.id,
      departmentId: params.id,
      action: "SMS_CONFIG_UPDATED",
      entity: "SmsConfiguration",
      entityId: config.id,
      metadata: {
        senderId: config.senderId,
        enabled: config.enabled,
        usernameChanged: parsed.username !== undefined,
        apiKeyChanged: Boolean(parsed.apiKey),
      },
    });

    return NextResponse.json({
      config: {
        senderId: config.senderId,
        messageTemplate: config.messageTemplate,
        username: config.username ?? "",
        hasApiKey: Boolean(config.apiKey),
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
