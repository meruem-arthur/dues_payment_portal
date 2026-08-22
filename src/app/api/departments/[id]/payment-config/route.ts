import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { paymentProviderConfigUpdateSchema } from "@/lib/validations/department";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto/field-encryption";

// Payment credentials for an already-created department.
//
// This is intentionally a separate file from src/app/api/departments/route.ts
// (the department create/list endpoint) and from src/app/api/departments/[id]/
// itself - nothing there is touched by this feature. The create-department
// form only ever collects the provider + the generic "configValue" field;
// the real secretKey/publicKey/webhookSecret are added afterward here, which
// is also the only place they can be rotated once set.
//
// Only SUPER_ADMIN may read or write this - department admins should never
// see or manage the raw provider secret key for their own department.

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

    const config = await prisma.paymentProviderConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    // Secrets are never sent to the client. The frontend only learns
    // whether a given secret has been set, not its value, so it can show
    // e.g. "Secret key is set - leave blank to keep it" placeholder text.
    return NextResponse.json({
      config: config
        ? {
            provider: config.provider,
            environment: config.environment,
            publicKey: config.publicKey ?? "",
            configValue: config.configValue ?? "",
            hasSecretKey: Boolean(config.secretKey),
            hasWebhookSecret: Boolean(config.webhookSecret),
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
    const parsed = paymentProviderConfigUpdateSchema.parse(body);

    const department = await prisma.department.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    // Convention: an omitted or blank secret-bearing field means "leave
    // this credential as it is" - not "clear it". Otherwise re-saving the
    // form after only rotating the secret key would silently wipe the
    // public key (which the client never receives back, so it can only
    // ever resubmit it if the user retypes it). Non-secret fields
    // (provider/environment) update whenever they're explicitly provided.
    //
    // secretKey/webhookSecret are encrypted at rest (see field-encryption.ts).
    // Only a freshly-submitted plaintext value from the form gets encrypted
    // here - the `existing` fallback is already-encrypted (or, for rows
    // saved before encryption was added, legacy plaintext) and is written
    // straight back unchanged either way.
    const secretIfProvided = (v: string | undefined) => (v ? v : undefined);
    const encryptedSecretIfProvided = (v: string | undefined) => (v ? encryptSecret(v) : undefined);

    const existing = await prisma.paymentProviderConfiguration.findUnique({
      where: { departmentId: params.id },
    });

    const data = {
      provider: parsed.provider ?? existing?.provider ?? "PAYSTACK",
      environment: parsed.environment ?? existing?.environment ?? "TEST",
      publicKey: secretIfProvided(parsed.publicKey) ?? existing?.publicKey ?? null,
      secretKey: encryptedSecretIfProvided(parsed.secretKey) ?? existing?.secretKey ?? null,
      webhookSecret: encryptedSecretIfProvided(parsed.webhookSecret) ?? existing?.webhookSecret ?? null,
      configValue: secretIfProvided(parsed.configValue) ?? existing?.configValue ?? null,
    };

    const config = await prisma.paymentProviderConfiguration.upsert({
      where: { departmentId: params.id },
      create: { departmentId: params.id, ...data },
      update: data,
    });

    // Never write secret values into the audit log - only which fields
    // changed and the non-secret provider/environment selection.
    await logAudit({
      userId: user.id,
      departmentId: params.id,
      action: "PAYMENT_CONFIG_UPDATED",
      entity: "PaymentProviderConfiguration",
      entityId: config.id,
      metadata: {
        provider: config.provider,
        environment: config.environment,
        publicKeyChanged: Boolean(parsed.publicKey),
        secretKeyChanged: Boolean(parsed.secretKey),
        webhookSecretChanged: Boolean(parsed.webhookSecret),
        configValueChanged: Boolean(parsed.configValue),
      },
    });

    return NextResponse.json({
      config: {
        provider: config.provider,
        environment: config.environment,
        publicKey: config.publicKey ?? "",
        configValue: config.configValue ?? "",
        hasSecretKey: Boolean(config.secretKey),
        hasWebhookSecret: Boolean(config.webhookSecret),
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
    // zod error
    return NextResponse.json({ error: "Invalid input", details: (err as any).issues }, { status: 400 });
  }
  captureError(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
