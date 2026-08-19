import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PENDING_PAYMENT_STALE_AFTER_MS } from "@/lib/payments/constants";
import { z } from "zod";

const initiateSchema = z.object({
  departmentSlug: z.string(),
  paymentType: z.enum(["FRESHER", "CONTINUING"]),
  referenceNumber: z.string().min(1),
  phone: z.string().min(9),
  email: z.string().email().optional(),
});

// Public endpoint - no session required. Students are matched by reference
// number, never by name. Amount is always taken from department config,
// never from client input, to prevent tampering.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = initiateSchema.parse(body);

    const department = await prisma.department.findUnique({
      where: { slug: input.departmentSlug },
      include: { paymentConfig: true, academicSession: true },
    });
    if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    if (department.status === "ARCHIVED") {
      return NextResponse.json({ error: "This department is no longer accepting payments" }, { status: 410 });
    }
    // "Configured" is deliberately provider-agnostic: some providers need a
    // secret key, some need a configValue (e.g. Hubtel's merchant account
    // number), some need both. The adapter itself throws a specific error
    // if something it actually requires is missing.
    if (!department.paymentConfig?.secretKey && !department.paymentConfig?.configValue) {
      return NextResponse.json({ error: "This department has not configured payments yet" }, { status: 400 });
    }

    const student = await prisma.student.findFirst({
      where: {
        departmentId: department.id,
        academicSessionId: department.academicSessionId,
        referenceNumber: input.referenceNumber,
      },
    });
    if (!student) {
      return NextResponse.json({ error: "No student found with that reference number in this department" }, { status: 404 });
    }

    // We don't do refunds, so a student who has already paid must never be
    // able to start a second payment flow - whether that's a double-click,
    // reopening an old link after paying, or a parent scanning the same QR
    // code the student already used.
    if (student.paymentStatus === "SUCCESS") {
      return NextResponse.json(
        { error: "You've already paid — check your SMS for your receipt." },
        { status: 409 }
      );
    }

    // Guard against a second payment flow starting while an earlier one is
    // still in progress (e.g. a double-click before the first request even
    // returns, or reopening the pay form seconds later). Only a RECENT
    // pending payment blocks a retry - once it's older than the stale-payment
    // cutoff it's treated as abandoned, matches what the expiry sweep in
    // /api/payments/expire-stale will clean up, and no longer blocks anything.
    const recentPendingPayment = await prisma.payment.findFirst({
      where: {
        studentId: student.id,
        status: "PENDING",
        createdAt: { gt: new Date(Date.now() - PENDING_PAYMENT_STALE_AFTER_MS) },
      },
      select: { id: true },
    });
    if (recentPendingPayment) {
      return NextResponse.json(
        {
          error:
            "You already have a payment in progress. Please wait a few minutes and check your SMS, or try again shortly.",
        },
        { status: 409 }
      );
    }

    // A student's true payment type is derived from their level, never from
    // whichever link/QR they happened to click. L100 = Fresher, everything
    // else (L200-L600) = Continuing. Reject before any payment record or
    // provider call is made, since we don't do refunds.
    const expectedPaymentType = student.level === "L100" ? "FRESHER" : "CONTINUING";
    if (input.paymentType !== expectedPaymentType) {
      const message =
        expectedPaymentType === "FRESHER"
          ? "You're registered as a Level 100 student — use the First Year link"
          : "You're registered as a continuing student - use the continuing student link";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const amount =
      input.paymentType === "FRESHER" ? Number(department.fresherAmount) : Number(department.continuingAmount);

    const internalReference = `PAY-${department.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const pendingPayment = await prisma.payment.create({
      data: {
        studentId: student.id,
        departmentId: department.id,
        academicSessionId: department.academicSessionId,
        provider: department.paymentConfig.provider,
        internalReference,
        amount,
        currency: "GHS",
        paymentType: input.paymentType,
        status: "PENDING",
      },
    });

    const provider = getPaymentProvider(department.paymentConfig.provider as "PAYSTACK" | "HUBTEL");
    const result = await provider.initiatePayment(
      {
        amount,
        currency: "GHS",
        email: input.email,
        phone: input.phone,
        internalReference,
        metadata: {
          studentReference: student.referenceNumber,
          departmentId: department.id,
          academicSessionId: department.academicSessionId,
          studentId: student.id,
          paymentType: input.paymentType,
        },
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/d/${department.slug}/payment-status?ref=${internalReference}`,
      },
      {
        publicKey: department.paymentConfig.publicKey,
        secretKey: department.paymentConfig.secretKey,
        webhookSecret: department.paymentConfig.webhookSecret,
        configValue: department.paymentConfig.configValue,
        environment: department.paymentConfig.environment,
      }
    );

    return NextResponse.json({ authorizationUrl: result.authorizationUrl, paymentId: pendingPayment.id });
  } catch (err) {
    console.error(err);
    // Never leak internal error/stack details to the public.
    return NextResponse.json({ error: "Could not initiate payment. Please try again." }, { status: 500 });
  }
}
