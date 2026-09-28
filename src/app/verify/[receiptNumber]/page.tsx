import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public by design - this is exactly what the QR code on a printed/forwarded
// receipt is for: anyone holding the paper (or a photo of it) can confirm
// it matches our records, without logging in. receiptNumber is sequential
// (see generateReceiptNumber in src/lib/receipts.ts) rather than an
// unguessable token, but that's the same tradeoff as a receipt number on any
// paper receipt - it identifies which record to check, it doesn't grant any
// ability to change it. Only the fields also already printed on the receipt
// itself are shown here, nothing additional (no phone/email).
//
// Rate-limited per IP (not per receiptNumber) since the risk this guards
// against is someone scripting through many different receipt numbers in a
// row, not a single receipt being scanned a lot - genuinely scanning your
// own receipt a few times a day should never trip this.
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function VerifyReceiptPage({ params }: { params: { receiptNumber: string } }) {
  const ip = getClientIp({ headers: headers() });
  const rateLimit = checkRateLimit(`receipts:verify:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);

  if (!rateLimit.allowed) {
    return (
      <main className="portal-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="portal-content portal-card w-full max-w-sm space-y-3 p-8">
          <h1 className="text-xl font-bold text-portal-text">Too Many Requests</h1>
          <p className="text-sm text-portal-muted">
            Please wait a few minutes before checking another receipt.
          </p>
        </div>
      </main>
    );
  }

  const receipt = await prisma.receipt.findUnique({
    where: { receiptNumber: params.receiptNumber },
    include: {
      payment: true,
      student: true,
      department: true,
    },
  });

  const isValid = !!receipt && receipt.payment.status === "SUCCESS";

  return (
    <main className="portal-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="portal-content portal-card w-full max-w-sm space-y-4 p-8">
        {isValid ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-2xl text-emerald-700">✓</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-portal-text">Valid Receipt</h1>
              <p className="text-sm text-portal-muted">
                This receipt matches our records for {receipt!.department.name}.
              </p>
            </div>
            <dl className="space-y-1.5 text-left text-sm">
              <Row label="Receipt No." value={receipt!.receiptNumber} />
              <Row label="Student Name" value={receipt!.student.fullName} />
              <Row label="Reference No." value={receipt!.student.referenceNumber} />
              <Row label="Department" value={receipt!.department.name} />
              <Row label="Payment Type" value={receipt!.payment.paymentType === "FRESHER" ? "Fresher" : "Continuing"} />
              <Row
                label="Amount Paid"
                value={`${receipt!.payment.currency} ${formatAmount(Number(receipt!.payment.amount))}`}
              />
              <Row label="Date Issued" value={formatDate(receipt!.issuedAt)} />
            </dl>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <span className="text-2xl text-red-700">✕</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-portal-text">Not a Valid Receipt</h1>
              <p className="text-sm text-portal-muted">
                We could not find a confirmed receipt matching &ldquo;{params.receiptNumber}&rdquo;. If you believe
                this is an error, contact the department directly.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-portal-muted">{label}</dt>
      <dd className="font-medium text-portal-text">{value}</dd>
    </div>
  );
}

function formatAmount(amount: number) {
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
