import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { resendReceipt } from "@/lib/receipts";
import { logAudit } from "@/lib/audit";

// POST /api/students/[id]/resend-receipt
//
// Manual escape hatch for a receipt that went to a wrong/typo'd phone or
// email: the original SMS/email only ever fires once, automatically, from
// inside the webhook handler at the moment a payment is first confirmed
// (see issueReceiptAndNotify in src/lib/receipts.ts). If a student's
// contact info was wrong at that moment, there was previously no way to
// get the same receipt out to them again - editing the student record
// (PATCH /api/students/[id]) fixes the contact info going forward but does
// nothing about the send that already happened.
//
// This re-sends using whatever the student's CURRENT phone/email is, so
// the intended flow is: admin notices the mistake -> edits the student's
// phone/email -> calls this. It never creates a new receipt, never
// re-verifies with the payment provider, and never touches payment status -
// it only resends the notification(s) for the student's existing
// successful payment.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: params.id } });
    const user = await requireDepartmentAccess(student.departmentId);

    const payment = await prisma.payment.findFirst({
      where: { studentId: student.id, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      select: { id: true },
    });

    if (!payment) {
      return NextResponse.json({ error: "This student has no successful payment to resend a receipt for" }, { status: 404 });
    }

    const results = await resendReceipt(payment.id);

    await logAudit({
      userId: user.id,
      departmentId: student.departmentId,
      action: "RECEIPT_RESENT",
      entity: "Payment",
      entityId: payment.id,
      metadata: {
        studentId: student.id,
        referenceNumber: student.referenceNumber,
        smsResult: results.sms,
        emailResult: results.email,
      },
    });

    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    captureError(err);
    return NextResponse.json({ error: "Could not resend the receipt" }, { status: 500 });
  }
}
