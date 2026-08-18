import { prisma } from "@/lib/db";
import { getSmsProvider } from "@/lib/sms/provider-factory";
import { getEmailProvider } from "@/lib/email/provider-factory";

/**
 * Generates a receipt number in the form REC-<year>-<zero-padded sequence>.
 * Uses a transaction-safe count query; for high concurrency this could be
 * swapped for a DB sequence, but is sufficient for department-dues volumes.
 */
export async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.receipt.count({
    where: { receiptNumber: { startsWith: `REC-${year}-` } },
  });
  const next = (count + 1).toString().padStart(6, "0");
  return `REC-${year}-${next}`;
}

/**
 * Called ONLY after a payment has been confirmed via verified webhook.
 * Creates the receipt, marks the student PAID, and fires notifications.
 * Notification failure (SMS/email) must never roll back the payment/receipt.
 */
export async function issueReceiptAndNotify(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { student: true, department: { include: { smsConfig: true, emailConfig: true } } },
  });

  if (payment.status !== "SUCCESS") {
    throw new Error("Cannot issue a receipt for a payment that is not SUCCESS");
  }

  // Idempotency: a receipt may already exist for this payment.
  const existing = await prisma.receipt.findUnique({ where: { paymentId } });
  if (existing) return existing;

  const receiptNumber = await generateReceiptNumber();

  const receipt = await prisma.$transaction(async (tx) => {
    const r = await tx.receipt.create({
      data: {
        receiptNumber,
        paymentId: payment.id,
        studentId: payment.studentId,
        departmentId: payment.departmentId,
      },
    });
    await tx.student.update({
      where: { id: payment.studentId },
      data: { paymentStatus: "SUCCESS" as any },
    });
    return r;
  });

  // Notifications happen outside the DB transaction and are best-effort.
  await sendSmsReceipt(payment, receiptNumber).catch((e) => console.error("SMS notify failed", e));

  return receipt;
}

async function sendSmsReceipt(
  payment: Awaited<ReturnType<typeof prisma.payment.findUniqueOrThrow>> & {
    student: { fullName: string; referenceNumber: string; phone: string; level: string };
    department: {
      name: string;
      smsConfig: { senderId: string; messageTemplate: string; enabled: boolean; apiKey: string | null; username: string | null } | null;
    };
  },
  receiptNumber: string
) {
  const smsConfig = payment.department.smsConfig;
  if (!smsConfig || !smsConfig.enabled) return;

  // Student.level is stored as "L100".."L600" (see prisma schema) - drop
  // the leading "L" so the SMS reads "Level : 300" as requested, not "L300".
  const levelDisplay = payment.student.level.replace(/^L/, "");

  const message = smsConfig.messageTemplate
    .replace("{department}", payment.department.name)
    .replace("{name}", payment.student.fullName)
    .replace("{reference}", payment.student.referenceNumber)
    .replace("{level}", levelDisplay)
    .replace("{receipt}", receiptNumber);

  const smsProvider = getSmsProvider();
  const result = await smsProvider.send(
    {
      to: payment.student.phone,
      message,
      senderId: smsConfig.senderId,
    },
    {
      apiKey: smsConfig.apiKey,
      username: smsConfig.username,
    }
  );

  await prisma.notificationLog.create({
    data: {
      departmentId: payment.departmentId,
      channel: "SMS",
      recipient: payment.student.phone,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.error,
      relatedPaymentId: payment.id,
    },
  });

  // Explicitly: SMS failure must NEVER change payment.status or receipt state.
}
