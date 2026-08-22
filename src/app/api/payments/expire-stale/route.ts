import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/monitoring/capture-error";
import { prisma } from "@/lib/db";
import {
  requireDepartmentAccess,
  requireSuperAdmin,
  UnauthorizedError,
  ForbiddenError,
  type SessionUser,
} from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { PENDING_PAYMENT_STALE_AFTER_MS } from "@/lib/payments/constants";

// POST /api/payments/expire-stale
//
// Marks CANCELLED any Payment that has been PENDING for longer than
// PENDING_PAYMENT_STALE_AFTER_MS. This covers checkouts a student started
// and abandoned - no webhook is ever coming for those. We never guess a
// payment failed while it could still be legitimately in-flight, so the
// cutoff is deliberately generous (see constants.ts).
//
// This also frees the student to retry: /api/payments/initiate blocks a new
// attempt while a RECENT pending payment exists, and stops seeing it once
// it's this stale, but expiring it here is what keeps the admin dashboard
// from accumulating dead pending rows indefinitely.
//
// Two ways to trigger it:
//  1. An authenticated admin action (see the "Expire Stale Pending" button
//     in the Departments admin UI) - scoped to that admin's department,
//     always requires a departmentId in the body.
//  2. An external scheduler (e.g. Vercel Cron) calling this with an
//     `x-cron-secret` header matching the CRON_SECRET env var, with no body -
//     runs across every department. CRON_SECRET is optional; if it's not
//     set, this trigger path is simply unavailable and only the admin
//     button works.
export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    const isCronTrigger = Boolean(cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET);

    let actingUser: SessionUser | null = null;
    let departmentId: string | null = null;

    if (!isCronTrigger) {
      const body = await req.json().catch(() => ({}) as { departmentId?: unknown });
      const requestedDepartmentId = typeof body.departmentId === "string" ? body.departmentId : null;

      if (requestedDepartmentId) {
        actingUser = await requireDepartmentAccess(requestedDepartmentId);
        departmentId = requestedDepartmentId;
      } else {
        // No departmentId - only a Super Admin may sweep every department at once.
        actingUser = await requireSuperAdmin();
      }
    }

    const cutoff = new Date(Date.now() - PENDING_PAYMENT_STALE_AFTER_MS);
    const result = await prisma.payment.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoff },
        ...(departmentId ? { departmentId } : {}),
      },
      data: { status: "CANCELLED" },
    });

    if (actingUser) {
      await logAudit({
        userId: actingUser.id,
        departmentId,
        action: "EXPIRE_STALE_PENDING_PAYMENTS",
        entity: "Payment",
        metadata: { expiredCount: result.count },
      });
    }

    return NextResponse.json({ expiredCount: result.count });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    captureError(err);
    return NextResponse.json({ error: "Could not expire stale payments" }, { status: 500 });
  }
}
