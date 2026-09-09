import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import { requireDepartmentAccess, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

// POST /api/students/[id]/cancel-pending-payment
//
// Manual escape hatch for "You already have a payment in progress." The
// initiate-payment guard (src/app/api/payments/initiate/route.ts) blocks a
// retry while a PENDING payment for the student is younger than
// PENDING_PAYMENT_STALE_AFTER_MS (24h) - correct for a payment that might
// still complete, but there was previously no way to unblock a student
// stuck inside that 24h window (e.g. the webhook never arrived, the
// browser was closed mid-checkout) short of waiting it out.
//
// This cancels every currently-PENDING payment for the student immediately,
// regardless of age, and never touches SUCCESS/FAILED/CANCELLED/REFUNDED
// payments - a student who has already paid, or whose payment already
// resolved another way, is unaffected. If Paystack's webhook does still
// arrive for a payment cancelled here, issueReceiptAndNotify's own
// idempotency check (see src/lib/receipts.ts) means it's a no-op, not a
// double-receipt - but this should be reserved for cases the admin has
// confirmed didn't actually go through (e.g. checked the provider
// dashboard, or the student says the payment page never completed).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: params.id } });
    const user = await requireDepartmentAccess(student.departmentId);

    const pending = await prisma.payment.findMany({
      where: { studentId: student.id, status: "PENDING" },
    });

    if (pending.length === 0) {
      return NextResponse.json({ error: "No pending payment to cancel for this student" }, { status: 404 });
    }

    await prisma.payment.updateMany({
      where: { id: { in: pending.map((p: { id: string }) => p.id) } },
      data: { status: "CANCELLED" },
    });

    await logAudit({
      userId: user.id,
      departmentId: student.departmentId,
      action: "PAYMENT_CANCELLED_MANUAL",
      entity: "Payment",
      entityId: pending[0].id,
      metadata: {
        studentId: student.id,
        referenceNumber: student.referenceNumber,
        cancelledCount: pending.length,
      },
    });

    return NextResponse.json({ cancelledCount: pending.length });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  captureError(err);
  return NextResponse.json({ error: "Could not cancel the pending payment" }, { status: 500 });
}
