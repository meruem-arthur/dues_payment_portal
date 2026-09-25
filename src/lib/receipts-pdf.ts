import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

export type ReceiptPdfData = {
  receiptNumber: string;
  issuedAt: Date;
  department: {
    name: string;
    logoUrl?: string | null;
    financialSecretaryName?: string | null;
    financialSecretarySignatureUrl?: string | null;
    presidentName?: string | null;
    presidentSignatureUrl?: string | null;
  };
  student: {
    fullName: string;
    referenceNumber: string;
    level: string; // "L100".."L400"
  };
  payment: {
    amount: number;
    currency: string;
    paymentType: "FRESHER" | "CONTINUING";
    provider: string; // "PAYSTACK" | "HUBTEL"
    paidAt: Date | null;
  };
  academicSessionName: string;
  // Fully-resolved link to the public /verify/[receiptNumber] page. Optional
  // and additive: when omitted (e.g. NEXT_PUBLIC_APP_URL isn't set, or an
  // older caller), the receipt renders exactly as it did before - just
  // without the verification QR block.
  verifyUrl?: string | null;
};

const PAGE_WIDTH = 419.53; // A5 portrait, points - a receipt doesn't need a full A4 sheet
const PAGE_HEIGHT = 595.28;
// The verification QR + caption need extra vertical room near the
// signatures block. Only grown when there's actually a QR to draw, so a
// receipt without verifyUrl keeps the exact original page size.
const VERIFY_BLOCK_HEIGHT = 108;
const MARGIN = 40;

/**
 * Decodes a `data:image/...;base64,...` URL (the only way images are ever
 * stored in this app - see Department.logoUrl / signature* on the schema)
 * and embeds it into the PDF. Returns null for anything missing or
 * malformed rather than throwing, since every image on a receipt is
 * optional - a department that hasn't uploaded a signature yet should
 * still get a valid receipt, just without that image.
 */
async function embedDataUrlImage(pdfDoc: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  try {
    const bytes = Buffer.from(match[2], "base64");
    return match[1].toLowerCase() === "png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch {
    // Corrupt/unreadable image data - skip it rather than fail the whole receipt.
    return null;
  }
}

function formatAmount(amount: number, currency: string) {
  const display = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
  return `${currency} ${display}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function drawRow(page: PDFPage, y: number, label: string, value: string, font: PDFFont, boldFont: PDFFont) {
  page.drawText(label, { x: MARGIN, y, size: 11, font: boldFont, color: rgb(0.35, 0.35, 0.35) });
  page.drawText(value, { x: MARGIN + 170, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
}

/**
 * Builds the PDF receipt attached to a payment confirmation email (and
 * offered as a direct download from the payment-status page). Every image
 * is optional and simply omitted if the department hasn't uploaded it -
 * see embedDataUrlImage above.
 */
export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const pageHeight = data.verifyUrl ? PAGE_HEIGHT + VERIFY_BLOCK_HEIGHT : PAGE_HEIGHT;
  const page = pdfDoc.addPage([PAGE_WIDTH, pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = pageHeight - MARGIN;

  // --- Header -------------------------------------------------------
  const logo = await embedDataUrlImage(pdfDoc, data.department.logoUrl);
  if (logo) {
    const logoSize = 40;
    const scale = Math.min(logoSize / logo.width, logoSize / logo.height);
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoSize,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  }

  page.drawText(data.department.name, {
    x: logo ? MARGIN + 52 : MARGIN,
    y: y - 18,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText("OFFICIAL PAYMENT RECEIPT", {
    x: logo ? MARGIN + 52 : MARGIN,
    y: y - 36,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  y -= 64;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 30;

  // --- Receipt No / Date --------------------------------------------
  drawRow(page, y, "Receipt No.", data.receiptNumber, font, boldFont);
  y -= 24;
  drawRow(page, y, "Date Issued", formatDate(data.issuedAt), font, boldFont);
  y -= 34;

  // --- Body -----------------------------------------------------------
  const levelDisplay = data.student.level.replace(/^L/, "");
  const rows: [string, string][] = [
    ["Student Name", data.student.fullName],
    ["Reference No.", data.student.referenceNumber],
    ["Level", levelDisplay],
    ["Academic Session", data.academicSessionName],
    ["Payment Type", data.payment.paymentType === "FRESHER" ? "Fresher" : "Continuing"],
    ["Amount Paid", formatAmount(data.payment.amount, data.payment.currency)],
    ["Payment Method", data.payment.provider === "PAYSTACK" ? "Paystack" : "Hubtel"],
    ...(data.payment.paidAt ? ([["Date Paid", formatDate(data.payment.paidAt)]] as [string, string][]) : []),
  ];

  for (const [label, value] of rows) {
    drawRow(page, y, label, value, font, boldFont);
    y -= 24;
  }

  y -= 20;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });

  // --- Verification QR ---------------------------------------------------
  // Separate from the "Download Receipt" link on the payment-status page -
  // this is printed on the PDF itself so a physical/forwarded copy can
  // still be checked against our records, right above the signatures it
  // sits next to.
  if (data.verifyUrl) {
    const qrSize = 62;
    try {
      const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { margin: 1, color: { dark: "#111111", light: "#ffffff" } });
      const qrImage = await embedDataUrlImage(pdfDoc, qrDataUrl);
      if (qrImage) {
        const qrY = y - 16 - qrSize;
        page.drawImage(qrImage, { x: (PAGE_WIDTH - qrSize) / 2, y: qrY, width: qrSize, height: qrSize });

        const caption = "Scan to verify this receipt";
        const captionWidth = font.widthOfTextAtSize(caption, 8);
        page.drawText(caption, {
          x: (PAGE_WIDTH - captionWidth) / 2,
          y: qrY - 12,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        });

        y = qrY - 26;
      }
    } catch {
      // A QR-generation failure must never block issuing the receipt itself.
    }
  }

  // --- Signatures footer -------------------------------------------------
  // Two columns: Financial Secretary signature (left), President signature
  // (right). Each is entirely optional - a department that's only
  // uploaded one still gets a clean receipt, just with blank space where
  // the other would go.
  const footerTop = y - 30;
  const colWidth = (PAGE_WIDTH - 2 * MARGIN) / 2;
  const imgMaxHeight = 42;
  const imgMaxWidth = colWidth - 20;

  async function drawSignatureColumn(
    colIndex: number,
    imageUrl: string | null | undefined,
    lineLabel: string,
    printedName: string | null | undefined
  ) {
    const colX = MARGIN + colIndex * colWidth;
    const centerX = colX + colWidth / 2;
    const image = await embedDataUrlImage(pdfDoc, imageUrl);

    const lineY = footerTop - imgMaxHeight;

    if (image) {
      const scale = Math.min(imgMaxWidth / image.width, imgMaxHeight / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, { x: centerX - w / 2, y: lineY + 2, width: w, height: h });
    }

    page.drawLine({
      start: { x: colX + 10, y: lineY },
      end: { x: colX + colWidth - 10, y: lineY },
      thickness: 0.75,
      color: rgb(0.6, 0.6, 0.6),
    });

    const label = printedName ? `${printedName}\n${lineLabel}` : lineLabel;
    label.split("\n").forEach((line, i) => {
      const size = i === 0 ? 10 : 9;
      const lineFont = i === 0 ? boldFont : font;
      const textWidth = lineFont.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: centerX - textWidth / 2,
        y: lineY - 14 - i * 12,
        size,
        font: lineFont,
        color: i === 0 ? rgb(0.1, 0.1, 0.1) : rgb(0.45, 0.45, 0.45),
      });
    });
  }

  await drawSignatureColumn(
    0,
    data.department.financialSecretarySignatureUrl,
    "Financial Secretary",
    data.department.financialSecretaryName
  );
  await drawSignatureColumn(1, data.department.presidentSignatureUrl, "President", data.department.presidentName);

  // --- Page footer ------------------------------------------------------
  const footerText = "This is a computer-generated receipt and does not require a physical signature to be valid.";
  page.drawText(footerText, {
    x: (PAGE_WIDTH - font.widthOfTextAtSize(footerText, 8)) / 2,
    y: MARGIN - 20,
    size: 8,
    font,
    color: rgb(0.55, 0.55, 0.55),
  });

  return pdfDoc.save();
}
