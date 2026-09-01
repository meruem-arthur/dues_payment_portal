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
  createdAt: Date;
};

/**
 * SUPER_ADMIN sees failures across every department; DEPARTMENT_ADMIN only
 * ever sees their own, via the same scopedDepartmentWhere() used everywhere
 * else - there is no separate/bespoke scoping logic to get wrong here.
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
      createdAt: { gte: since },
    },
    include: { department: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS,
  });

  return failures.map((f) => ({
    id: f.id,
    departmentId: f.departmentId,
    departmentName: f.department?.name ?? "Unknown department",
    channel: f.channel as "EMAIL" | "SMS",
    recipient: f.recipient,
    errorMessage: f.errorMessage,
    relatedPaymentId: f.relatedPaymentId,
    createdAt: f.createdAt,
  }));
}
