import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateReceiptPdf } from "@/lib/receipts-pdf";
import { captureError } from "@/lib/monitoring/capture-error";

// GET /api/receipts/download?ref=<payment.internalReference>
//
// Public by design - same trust model as the payment-status page it's
// linked from (src/app/d/[departmentSlug]/payment-status/page.tsx): the
// internalReference is a server-generated, unguessable identifier, not a
// sequential id, and it's the same key that page already uses to look up
// and display the payment with no login required. No new exposure here,
// just a second thing you can do with the same reference already in the
// URL.
export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("ref");
    if (!ref) {
      return NextResponse.json({ error: "Missing ref" }, { status: 400 });
    }

    const payment = await prisma.payment.findUnique({
      where: { internalReference: ref },
      include: {
        student: true,
        academicSession: true,
        department: true,
        receipt: true,
      },
    });

    if (!payment || !payment.receipt) {
      return NextResponse.json({ error: "No receipt found for that reference" }, { status: 404 });
    }
    if (payment.status !== "SUCCESS") {
      return NextResponse.json({ error: "This payment has not been confirmed yet" }, { status: 409 });
    }

    const amountNumber = Number(payment.amount);
    const pdfBytes = await generateReceiptPdf({
      receiptNumber: payment.receipt.receiptNumber,
      issuedAt: payment.receipt.issuedAt,
      department: payment.department,
      student: payment.student,
      payment: {
        amount: amountNumber,
        currency: payment.currency,
        paymentType: payment.paymentType,
        provider: payment.provider,
        paidAt: payment.paidAt,
      },
      academicSessionName: payment.academicSession.name,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payment.receipt.receiptNumber}.pdf"`,
        // Receipts never change once issued - safe for the browser to cache.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    captureError(err, { context: "receipt-pdf-download" });
    return NextResponse.json({ error: "Could not generate receipt" }, { status: 500 });
  }
}
