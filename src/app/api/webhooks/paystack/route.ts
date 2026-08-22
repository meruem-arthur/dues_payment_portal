import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { issueReceiptAndNotify } from "@/lib/receipts";
import { decryptPaymentSecrets } from "@/lib/crypto/field-encryption";

/**
 * Webhook is the ONLY authoritative source that marks a payment SUCCESS.
 * The student's browser redirect after payment is purely a UX convenience
 * and must never itself mark anything paid.
 *
 * Flow:
 * 1. Read raw body (needed for signature verification - do not re-serialize).
 * 2. Parse payload to find which department this event belongs to (via our
 *    own internalReference/metadata, since Paystack accounts are per-department).
 * 3. Load that department's webhook secret and verify the signature.
 * 4. Look up the pending Payment by internalReference.
 * 5. Idempotency: insert a WebhookEvent row with a unique (provider, providerEventId)
 *    constraint. If it already exists, acknowledge 200 and do nothing further.
 * 6. Mark payment SUCCESS, issue receipt, send SMS.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  let parsedPreview: any;
  try {
    parsedPreview = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const internalReference: string | undefined = parsedPreview?.data?.reference;
  const metaDepartmentId: string | undefined = parsedPreview?.data?.metadata?.departmentId;

  if (!internalReference) {
    return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 });
  }

  // Resolve department either from metadata or by looking up the pending payment record,
  // since metadata could theoretically be stripped by some gateways.
  const pendingPayment = await prisma.payment.findUnique({
    where: { internalReference },
    include: { department: { include: { paymentConfig: true, smsConfig: true } } },
  });

  const department = pendingPayment?.department;
  if (!department || !department.paymentConfig) {
    return NextResponse.json({ error: "Unknown transaction / department" }, { status: 404 });
  }

  const provider = getPaymentProvider(department.paymentConfig.provider as "PAYSTACK" | "HUBTEL");
  const paymentConfig = decryptPaymentSecrets(department.paymentConfig);

  const validSignature = provider.verifyWebhookSignature(rawBody, signature, {
    publicKey: paymentConfig.publicKey,
    secretKey: paymentConfig.secretKey,
    webhookSecret: paymentConfig.webhookSecret,
    environment: paymentConfig.environment,
  });

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const parsed = provider.parseWebhookPayload(rawBody);

  try {
    // Idempotency gate: this insert will throw on a duplicate (provider, providerEventId).
    await prisma.webhookEvent.create({
      data: {
        departmentId: department.id,
        paymentId: pendingPayment.id,
        provider: department.paymentConfig.provider,
        providerEventId: parsed.providerEventId,
        rawPayload: parsedPreview,
        processed: false,
      },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      // Already processed this exact event - acknowledge without side effects.
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  if (!parsed.success) {
    await prisma.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
    await prisma.webhookEvent.updateMany({
      where: { provider: department.paymentConfig.provider, providerEventId: parsed.providerEventId },
      data: { processed: true },
    });
    return NextResponse.json({ received: true });
  }

  // Extra defense-in-depth: re-verify directly with the provider's API, not just the webhook signature.
  const verified = await provider.verifyTransaction(
    { providerTxId: parsed.providerTxId, internalReference: parsed.internalReference },
    {
      publicKey: paymentConfig.publicKey,
      secretKey: paymentConfig.secretKey,
      webhookSecret: paymentConfig.webhookSecret,
      environment: paymentConfig.environment,
    }
  );

  if (!verified.success || verified.internalReference !== pendingPayment.internalReference) {
    await prisma.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
    return NextResponse.json({ received: true, verificationFailed: true });
  }

  await prisma.payment.update({
    where: { id: pendingPayment.id },
    data: {
      status: "SUCCESS",
      providerTxId: verified.providerTxId,
      paidAt: verified.paidAt ?? new Date(),
    },
  });

  await issueReceiptAndNotify(pendingPayment.id);

  await prisma.webhookEvent.updateMany({
    where: { provider: department.paymentConfig.provider, providerEventId: parsed.providerEventId },
    data: { processed: true },
  });

  return NextResponse.json({ received: true });
}
