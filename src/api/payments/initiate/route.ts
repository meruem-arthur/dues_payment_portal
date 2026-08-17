import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
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
