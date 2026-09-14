import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    payment: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { GET } from "./route";

const mockedPrisma = vi.mocked(prisma, true);

function makeRequest(ref?: string) {
  const url = ref ? `http://localhost/api/receipts/download?ref=${ref}` : "http://localhost/api/receipts/download";
  return new NextRequest(url);
}

const successPayment = {
  id: "payment_1",
  internalReference: "internal_ref_1",
  status: "SUCCESS",
  amount: 100,
  currency: "GHS",
  paymentType: "CONTINUING",
  provider: "PAYSTACK",
  paidAt: new Date("2026-09-13T09:00:00Z"),
  student: { fullName: "Kwame Mensah", referenceNumber: "REF001", level: "L300" },
  academicSession: { name: "2026/2027" },
  department: { name: "Ceramic Engineering" },
  receipt: { receiptNumber: "REC-2026-000006", issuedAt: new Date("2026-09-13T09:00:00Z") },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/receipts/download", () => {
  it("returns 400 when ref is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when no payment matches the reference", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the payment has no receipt yet", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue({ ...successPayment, receipt: null } as any);
    const res = await GET(makeRequest("internal_ref_1"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when the payment is not SUCCESS", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue({ ...successPayment, status: "PENDING" } as any);
    const res = await GET(makeRequest("internal_ref_1"));
    expect(res.status).toBe(409);
  });

  it("streams back a PDF with the right headers for a confirmed payment", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue(successPayment as any);
    const res = await GET(makeRequest("internal_ref_1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("REC-2026-000006.pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    // %PDF is the standard magic header for a PDF file.
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
  });
});
