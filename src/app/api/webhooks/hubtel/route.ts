import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { issueReceiptAndNotify } from "@/lib/receipts";

/**
 * Hubtel's server-to-server payment callback. Same authoritative-source and
 * idempotency rules as /api/webhooks/paystack (see the comment there) - the
 * only differences are payload shape and how the request is authenticated:
 * Hubtel doesn't sign its callbacks, so we rely on a shared token appended
 * to the callback URL at checkout-initiation time (see hubtel.provider.ts).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const token = req.nextUrl.searchParams.get("token");

  let parsedPreview: any;
  try {
    parsedPreview = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tx = parsedPreview?.Data ?? parsedPreview?.data ?? parsedPreview;
  const internalReference: string | undefined = tx?.ClientReference ?? tx?.clientReference;

  if (!internalReference) {
    return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 });
  }

  const pendingPayment = await prisma.payment.findUnique({
    where: { internalReference },
    include: { department: { include: { paymentConfig: true, smsConfig: true } } },
  });

  const department = pendingPayment?.department;
  if (!department || !department.paymentConfig) {
    return NextResponse.json({ error: "Unknown transaction / department" }, { status: 404 });
  }

  const provider = getPaymentProvider("HUBTEL");

  const credentials = {
    publicKey: department.paymentConfig.publicKey,
    secretKey: department.paymentConfig.secretKey,
    webhookSecret: department.paymentConfig.webhookSecret,
    configValue: department.paymentConfig.configValue,
    environment: department.paymentConfig.environment,
  };

  const validSignature = provider.verifyWebhookSignature(rawBody, token, credentials);
  if (!validSignature) {
    return NextResponse.json({ error: "Invalid or missing webhook token" }, { status: 401 });
  }

  const parsed = provider.parseWebhookPayload(rawBody);

  try {
    // Idempotency gate: throws on a duplicate (provider, providerEventId).
    await prisma.webhookEvent.create({
      data: {
        departmentId: department.id,
        paymentId: pendingPayment.id,
        provider: "HUBTEL",
        providerEventId: parsed.providerEventId,
        rawPayload: parsedPreview,
        processed: false,
      },
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  if (!parsed.success) {
    await prisma.payment.update({ where: { id: pendingPayment.id }, data: { status: "FAILED" } });
    await prisma.webhookEvent.updateMany({
      where: { provider: "HUBTEL", providerEventId: parsed.providerEventId },
      data: { processed: true },
    });
    return NextResponse.json({ received: true });
  }

  // Defense in depth: re-verify directly with Hubtel's API, not just the callback body.
  const verified = await provider.verifyTransaction(
    { providerTxId: parsed.providerTxId, internalReference: parsed.internalReference },
    credentials
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
    where: { provider: "HUBTEL", providerEventId: parsed.providerEventId },
    data: { processed: true },
  });

  return NextResponse.json({ received: true });
}
