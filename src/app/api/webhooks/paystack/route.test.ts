import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    webhookEvent: { create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/payments/provider-factory", () => ({
  getPaymentProvider: vi.fn(),
}));

vi.mock("@/lib/receipts", () => ({
  issueReceiptAndNotify: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { issueReceiptAndNotify } from "@/lib/receipts";
import { POST } from "./route";

const mockedPrisma = vi.mocked(prisma, true);
const mockedGetPaymentProvider = vi.mocked(getPaymentProvider);
const mockedIssueReceipt = vi.mocked(issueReceiptAndNotify);

const paymentConfig = {
  provider: "PAYSTACK",
  publicKey: "pk",
  secretKey: "sk",
  webhookSecret: "wh_secret",
  environment: "TEST",
};

const pendingPayment = {
  id: "payment_1",
  internalReference: "PAY-CE-123",
  department: {
    id: "dept_1",
    paymentConfig,
    smsConfig: { enabled: true },
  },
};

function makeRequest(payload: unknown, signature = "valid-sig") {
  return new NextRequest("http://localhost/api/webhooks/paystack", {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": signature },
    body: JSON.stringify(payload),
  });
}

const rawPayload = { data: { reference: "PAY-CE-123", metadata: { departmentId: "dept_1" } } };

let providerMock: {
  verifyWebhookSignature: ReturnType<typeof vi.fn>;
  parseWebhookPayload: ReturnType<typeof vi.fn>;
  verifyTransaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();

  mockedPrisma.payment.findUnique.mockResolvedValue(pendingPayment as any);
  mockedPrisma.webhookEvent.create.mockResolvedValue({ id: "evt_1" } as any);
  mockedPrisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 } as any);
  mockedPrisma.payment.update.mockResolvedValue({} as any);
  mockedIssueReceipt.mockResolvedValue({} as any);

  providerMock = {
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    parseWebhookPayload: vi.fn().mockReturnValue({
      success: true,
      providerTxId: "tx_1",
      internalReference: "PAY-CE-123",
      amount: 100,
      currency: "GHS",
      paidAt: new Date("2026-01-01T00:00:00Z"),
      raw: {},
      providerEventId: "evt_ext_1",
    }),
    verifyTransaction: vi.fn().mockResolvedValue({
      success: true,
      providerTxId: "tx_1",
      internalReference: "PAY-CE-123",
      amount: 100,
      currency: "GHS",
      paidAt: new Date("2026-01-01T00:00:00Z"),
      raw: {},
    }),
  };
  mockedGetPaymentProvider.mockReturnValue(providerMock as any);
});

describe("POST /api/webhooks/paystack", () => {
  it("marks the payment SUCCESS and issues a receipt on a valid, verified event", async () => {
    const res = await POST(makeRequest(rawPayload));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
    expect(mockedPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: expect.objectContaining({ status: "SUCCESS", providerTxId: "tx_1" }),
    });
    expect(mockedIssueReceipt).toHaveBeenCalledWith("payment_1");
  });

  it("rejects requests with an invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/paystack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedPrisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when the transaction reference is missing", async () => {
    const res = await POST(makeRequest({ data: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown transaction reference", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(rawPayload));
    expect(res.status).toBe(404);
  });

  it("rejects a request with an invalid webhook signature", async () => {
    providerMock.verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(makeRequest(rawPayload));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/invalid webhook signature/i);
    expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockedIssueReceipt).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate event without reprocessing it", async () => {
    const duplicateError: any = new Error("Unique constraint failed");
    duplicateError.code = "P2002";
    mockedPrisma.webhookEvent.create.mockRejectedValue(duplicateError);

    const res = await POST(makeRequest(rawPayload));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.duplicate).toBe(true);
    expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockedIssueReceipt).not.toHaveBeenCalled();
  });

  it("marks the payment FAILED when the provider reports a failed transaction", async () => {
    providerMock.parseWebhookPayload.mockReturnValue({
      success: false,
      providerTxId: "tx_1",
      internalReference: "PAY-CE-123",
      amount: 100,
      currency: "GHS",
      paidAt: null,
      raw: {},
      providerEventId: "evt_ext_1",
    });

    const res = await POST(makeRequest(rawPayload));

    expect(res.status).toBe(200);
    expect(mockedPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: { status: "FAILED" },
    });
    expect(mockedIssueReceipt).not.toHaveBeenCalled();
  });

  it("marks the payment FAILED when server-side verification with the provider fails", async () => {
    providerMock.verifyTransaction.mockResolvedValue({
      success: false,
      providerTxId: "tx_1",
      internalReference: "PAY-CE-123",
      amount: 100,
      currency: "GHS",
      paidAt: null,
      raw: {},
    });

    const res = await POST(makeRequest(rawPayload));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.verificationFailed).toBe(true);
    expect(mockedPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: { status: "FAILED" },
    });
    expect(mockedIssueReceipt).not.toHaveBeenCalled();
  });

  it("marks the payment FAILED when the verified reference doesn't match the pending payment", async () => {
    providerMock.verifyTransaction.mockResolvedValue({
      success: true,
      providerTxId: "tx_1",
      internalReference: "SOME-OTHER-REFERENCE",
      amount: 100,
      currency: "GHS",
      paidAt: new Date(),
      raw: {},
    });

    const res = await POST(makeRequest(rawPayload));
    const data = await res.json();

    expect(data.verificationFailed).toBe(true);
    expect(mockedIssueReceipt).not.toHaveBeenCalled();
  });
});
