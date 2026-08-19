import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findUniqueOrThrow: vi.fn() },
    receipt: { findUnique: vi.fn(), count: vi.fn() },
    student: { update: vi.fn() },
    notificationLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/sms/provider-factory", () => ({
  getSmsProvider: vi.fn(),
}));

vi.mock("@/lib/email/provider-factory", () => ({
  getEmailProvider: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getSmsProvider } from "@/lib/sms/provider-factory";
import { issueReceiptAndNotify } from "@/lib/receipts";

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetSmsProvider = vi.mocked(getSmsProvider);

const successPayment = {
  id: "payment_1",
  studentId: "student_1",
  amount: { toString: () => "100" }, // Number() on this works via toString below (see toNumberish note)
  status: "SUCCESS",
  student: { fullName: "Kwame Mensah", referenceNumber: "REF001", phone: "0551234567", level: "L300" },
  department: {
    name: "Ceramic Engineering",
    smsConfig: {
      enabled: true,
      senderId: "UMAT",
      apiKey: "key",
      username: "user",
      messageTemplate: "{name}, {department} dues of GHS {amount} received. Level {level}. Ref {reference}. {receipt}",
    },
    emailConfig: null,
  },
};

// Payment.amount is a Prisma Decimal in production; Number(decimal) works via
// its custom toString/valueOf. Plain numbers behave identically for Number(),
// so tests use plain numbers to avoid pulling in the Decimal class.
const successPaymentAmount100 = { ...successPayment, amount: 100 };

let txMock: { receipt: { create: ReturnType<typeof vi.fn> }; student: { update: ReturnType<typeof vi.fn> } };
let smsSend: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockedPrisma.payment.findUniqueOrThrow.mockResolvedValue(successPaymentAmount100 as any);
  mockedPrisma.receipt.findUnique.mockResolvedValue(null);
  mockedPrisma.receipt.count.mockResolvedValue(5);
  mockedPrisma.notificationLog.create.mockResolvedValue({} as any);

  txMock = {
    receipt: { create: vi.fn().mockResolvedValue({ id: "receipt_1", receiptNumber: "REC-2026-000006" }) },
    student: { update: vi.fn().mockResolvedValue({}) },
  };
  mockedPrisma.$transaction.mockImplementation(async (cb: any) => cb(txMock));

  smsSend = vi.fn().mockResolvedValue({ success: true, providerMessageId: "sms_1" });
  mockedGetSmsProvider.mockReturnValue({ send: smsSend } as any);
});

describe("issueReceiptAndNotify", () => {
  it("throws if the payment is not SUCCESS", async () => {
    mockedPrisma.payment.findUniqueOrThrow.mockResolvedValue({ ...successPaymentAmount100, status: "PENDING" } as any);

    await expect(issueReceiptAndNotify("payment_1")).rejects.toThrow(/not SUCCESS/i);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("is idempotent - returns the existing receipt without creating a new one", async () => {
    const existing = { id: "receipt_existing", receiptNumber: "REC-2026-000003" };
    mockedPrisma.receipt.findUnique.mockResolvedValue(existing as any);

    const result = await issueReceiptAndNotify("payment_1");

    expect(result).toBe(existing);
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(smsSend).not.toHaveBeenCalled();
  });

  it("creates the receipt, marks the student paid, and sends the SMS with the right details", async () => {
    await issueReceiptAndNotify("payment_1");

    expect(txMock.receipt.create).toHaveBeenCalledWith({
      data: { receiptNumber: "REC-2026-000006", paymentId: "payment_1", studentId: "student_1", departmentId: undefined },
    });
    expect(txMock.student.update).toHaveBeenCalledWith({
      where: { id: "student_1" },
      data: { paymentStatus: "SUCCESS" },
    });

    expect(smsSend).toHaveBeenCalledTimes(1);
    const [sentMessage] = smsSend.mock.calls[0];
    // Level is shown without the leading "L", amount without currency symbol,
    // and the receipt number is included.
    expect(sentMessage.message).toContain("Level 300");
    expect(sentMessage.message).toContain("GHS 100");
    expect(sentMessage.message).toContain("REC-2026-000006");
    expect(sentMessage.to).toBe("0551234567");
  });

  it("never sends duplicate quotes for a whole number amount (no trailing .00)", async () => {
    await issueReceiptAndNotify("payment_1");
    const [sentMessage] = smsSend.mock.calls[0];
    expect(sentMessage.message).not.toContain("100.00");
  });

  it("does not send SMS when the department's SMS config is disabled", async () => {
    mockedPrisma.payment.findUniqueOrThrow.mockResolvedValue({
      ...successPaymentAmount100,
      department: { ...successPaymentAmount100.department, smsConfig: { ...successPaymentAmount100.department.smsConfig, enabled: false } },
    } as any);

    await issueReceiptAndNotify("payment_1");

    expect(smsSend).not.toHaveBeenCalled();
  });

  it("does not throw and still returns the receipt when SMS sending fails", async () => {
    smsSend.mockRejectedValue(new Error("SMS gateway down"));

    const result = await issueReceiptAndNotify("payment_1");

    expect(result).toEqual(expect.objectContaining({ id: "receipt_1" }));
  });
});
