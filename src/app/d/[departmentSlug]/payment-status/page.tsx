import { prisma } from "@/lib/db";

// This page is a UX convenience only - it reads current status to show
// a friendly message. It NEVER mutates payment status itself; only the
// webhook handler (src/app/api/webhooks/paystack/route.ts) is authoritative.
export default async function PaymentStatusPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const payment = searchParams.ref
    ? await prisma.payment.findUnique({
        where: { internalReference: searchParams.ref },
        include: { student: true, receipt: true },
      })
    : null;

  if (!payment) {
    return (
      <main className="portal-shell flex min-h-screen items-center justify-center px-4 text-center">
        <p className="portal-content text-portal-muted">We could not find that payment. If you were charged, contact your department.</p>
      </main>
    );
  }

  const isPending = payment.status === "PENDING";

  return (
    <main className="portal-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="portal-content portal-card max-w-md space-y-3 p-8">
        <h1 className="text-2xl font-bold text-portal-text">
          {payment.status === "SUCCESS" ? "Payment Successful" : isPending ? "Confirming Payment..." : "Payment Not Completed"}
        </h1>
        <p className="text-portal-muted">
          {isPending
            ? "We're waiting for confirmation from the payment provider. This page will not auto-refresh - please check back in a minute, or watch for your SMS receipt."
            : payment.status === "SUCCESS"
            ? `Receipt ${payment.receipt?.receiptNumber ?? ""} has been issued and an SMS has been sent to ${payment.student.phone}.`
            : "Your payment was not successful. Please try again or contact your department."}
        </p>
      </div>
    </main>
  );
}
