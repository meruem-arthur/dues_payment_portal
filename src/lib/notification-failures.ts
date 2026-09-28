import { prisma } from "@/lib/db";
import { scopedDepartmentWhere, type SessionUser } from "@/lib/authorization";

/**
 * Surfaces recent SENT/EMAIL and SMS failures so config drift (a revoked
 * API key, a provider's IP allowlist, an unverified sender) shows up on the
 * dashboard within minutes instead of being discovered when a student
 * complains they never got a receipt. See NotificationLog.errorMessage for
 * the underlying incident this was built for: Brevo blocking Vercel's
 * rotating outbound IPs.
 */
export const NOTIFICATION_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 50;

export type NotificationFailure = {
  id: string;
  departmentId: string;
  departmentName: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  errorMessage: string | null;
  relatedPaymentId: string | null;
  // The reference number of the student whose payment triggered this
  // notification, when relatedPaymentId points at one we can still find -
  // lets an admin match "SMS failed for 0244139665" back to an actual
  // student/payment without having to search by phone number.
  studentReferenceNumber: string | null;
  createdAt: Date;
};

/**
 * SUPER_ADMIN sees failures across every department; DEPARTMENT_ADMIN only
 * ever sees their own, via the same scopedDepartmentWhere() used everywhere
 * else - there is no separate/bespoke scoping logic to get wrong here.
 *
 * Resolved failures (resolvedAt set - see the "Mark fixed" action in
 * NotificationFailuresAlert) are excluded even if still within the lookback
 * window, so dismissing one doesn't just get overwritten by the window on
 * next load. Unresolved ones still age out after windowMs regardless.
 */
export async function getRecentNotificationFailures(
  user: SessionUser,
  windowMs: number = NOTIFICATION_FAILURE_WINDOW_MS
): Promise<NotificationFailure[]> {
  const since = new Date(Date.now() - windowMs);

  const failures = await prisma.notificationLog.findMany({
    where: {
      ...scopedDepartmentWhere(user),
      status: "FAILED",
      resolvedAt: null,
      createdAt: { gte: since },
    },
    include: { department: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS,
  });

  const paymentIds = failures
    .map((f: { relatedPaymentId: string | null }) => f.relatedPaymentId)
    .filter((id: string | null): id is string => Boolean(id));
  const payments = paymentIds.length
    ? await prisma.payment.findMany({
        where: { id: { in: paymentIds } },
        select: { id: true, student: { select: { referenceNumber: true } } },
      })
    : [];
  const referenceByPaymentId = new Map(
    payments.map((p: { id: string; student: { referenceNumber: string } }) => [p.id, p.student.referenceNumber])
  );

  return failures.map((f: (typeof failures)[number]) => ({
    id: f.id,
    departmentId: f.departmentId,
    departmentName: f.department?.name ?? "Unknown department",
    channel: f.channel as "EMAIL" | "SMS",
    recipient: f.recipient,
    errorMessage: f.errorMessage,
    relatedPaymentId: f.relatedPaymentId,
    studentReferenceNumber: f.relatedPaymentId ? (referenceByPaymentId.get(f.relatedPaymentId) ?? null) : null,
    createdAt: f.createdAt,
  }));
}

/**
 * Marks a notification failure resolved so it stops showing in the alert.
 * Scoped the same way the read path is: a DEPARTMENT_ADMIN can only resolve
 * a failure that belongs to their own department.
 */
export async function resolveNotificationFailure(user: SessionUser, notificationLogId: string): Promise<boolean> {
  const log = await prisma.notificationLog.findUnique({
    where: { id: notificationLogId },
    select: { departmentId: true },
  });
  if (!log) return false;

  if (user.role !== "SUPER_ADMIN" && log.departmentId !== user.departmentId) {
    return false;
  }

  await prisma.notificationLog.update({
    where: { id: notificationLogId },
    data: { resolvedAt: new Date(), resolvedBy: user.id },
  });
  return true;
}
