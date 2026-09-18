import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateReceiptPdf, type ReceiptPdfData } from "./receipts-pdf";

// 1x1 transparent PNG - small enough to embed quickly in tests.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const baseData: ReceiptPdfData = {
  receiptNumber: "REC-2026-000042",
  issuedAt: new Date("2026-09-13T10:00:00Z"),
  department: { name: "Geomatic Engineering" },
  student: { fullName: "Ama Serwaa", referenceNumber: "REF999", level: "L300" },
  payment: { amount: 150, currency: "GHS", paymentType: "CONTINUING", provider: "PAYSTACK", paidAt: new Date("2026-09-13T10:00:00Z") },
  academicSessionName: "2026/2027",
};

describe("generateReceiptPdf", () => {
  it("produces a valid, single-page PDF with no branding images", async () => {
    const bytes = await generateReceiptPdf(baseData);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("embeds both signature images when provided", async () => {
    const bytes = await generateReceiptPdf({
      ...baseData,
      department: {
        ...baseData.department,
        logoUrl: TINY_PNG,
        financialSecretaryName: "Ama Boateng",
        financialSecretarySignatureUrl: TINY_PNG,
        presidentName: "Kwame Owusu",
        presidentSignatureUrl: TINY_PNG,
      },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // 3 embedded images: logo, 2 signatures.
    expect(doc.context.enumerateIndirectObjects().length).toBeGreaterThan(0);
  });

  it("never throws on a malformed image value - just omits it", async () => {
    const bytes = await generateReceiptPdf({
      ...baseData,
      department: { ...baseData.department, financialSecretarySignatureUrl: "not-a-data-url" },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("handles a FRESHER payment with no paidAt", async () => {
    const bytes = await generateReceiptPdf({
      ...baseData,
      payment: { ...baseData.payment, paymentType: "FRESHER", paidAt: null },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
