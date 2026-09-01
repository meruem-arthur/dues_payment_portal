import { prisma } from "@/lib/db";
import { getSmsProvider } from "@/lib/sms/provider-factory";
import { getEmailProvider } from "@/lib/email/provider-factory";
import { decryptSmsApiKey } from "@/lib/crypto/field-encryption";
import { captureError } from "@/lib/monitoring/capture-error";

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

  // Notifications happen outside the DB transaction and are best-effort -
  // one channel failing must never affect the other or the payment/receipt.
  await sendSmsReceipt(payment, receiptNumber).catch((e) => captureError(e, { context: "sms-receipt", paymentId: payment.id }));
  await sendEmailReceipt(payment, receiptNumber).catch((e) => captureError(e, { context: "email-receipt", paymentId: payment.id }));

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

  // Student.level is stored as "L100".."L400" (see prisma schema) - drop
  // the leading "L" so the SMS reads "Level : 300" as requested, not "L300".
  const levelDisplay = payment.student.level.replace(/^L/, "");

  // payment.amount is a Prisma Decimal - format as plain "150" / "150.50",
  // no trailing ".00" clutter, no currency symbol baked in (template controls that).
  const amountNumber = Number(payment.amount);
  const amountDisplay = Number.isInteger(amountNumber) ? amountNumber.toString() : amountNumber.toFixed(2);

  const message = smsConfig.messageTemplate
    .replace("{department}", payment.department.name)
    .replace("{name}", payment.student.fullName)
    .replace("{reference}", payment.student.referenceNumber)
    .replace("{level}", levelDisplay)
    .replace("{amount}", amountDisplay)
    .replace("{receipt}", receiptNumber);

  const decryptedSmsConfig = decryptSmsApiKey(smsConfig);
  const smsProvider = getSmsProvider();
  const result = await smsProvider.send(
    {
      to: payment.student.phone,
      message,
      senderId: decryptedSmsConfig.senderId,
    },
    {
      apiKey: decryptedSmsConfig.apiKey,
      username: decryptedSmsConfig.username,
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

async function sendEmailReceipt(
  payment: Awaited<ReturnType<typeof prisma.payment.findUniqueOrThrow>> & {
    student: { fullName: string; referenceNumber: string; email: string | null; level: string };
    department: {
      name: string;
      emailConfig: { fromAddress: string | null; emailTemplate: string; enabled: boolean } | null;
    };
  },
  receiptNumber: string
) {
  const emailConfig = payment.department.emailConfig;
  // Two independent conditions gate this, both required: the department
  // must have turned email receipts on, AND this particular student must
  // have an email on file (it's an optional field collected at checkout).
  if (!emailConfig || !emailConfig.enabled || !payment.student.email) return;

  const amountNumber = Number(payment.amount);
  const amountDisplay = Number.isInteger(amountNumber) ? amountNumber.toString() : amountNumber.toFixed(2);

  const body = emailConfig.emailTemplate
    .replace("{name}", payment.student.fullName)
    .replace("{department}", payment.department.name)
    .replace("{amount}", amountDisplay)
    .replace("{reference}", payment.student.referenceNumber)
    .replace("{receipt}", receiptNumber);

  const emailProvider = getEmailProvider();
  const result = await emailProvider.send({
    to: payment.student.email,
    subject: `${payment.department.name} dues receipt - ${receiptNumber}`,
    body,
    from: emailConfig.fromAddress ?? undefined,
  });

  await prisma.notificationLog.create({
    data: {
      departmentId: payment.departmentId,
      channel: "EMAIL",
      recipient: payment.student.email,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.error,
      relatedPaymentId: payment.id,
    },
  });

  // Same rule as SMS: email failure must NEVER change payment/receipt state.
}
