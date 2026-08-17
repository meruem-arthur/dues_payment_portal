import crypto from "crypto";
import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifiedTransaction,
  ProviderCredentials,
} from "./provider.interface";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackProvider implements PaymentProvider {
  readonly name = "PAYSTACK" as const;

  async initiatePayment(
    input: InitiatePaymentInput,
    credentials: ProviderCredentials
  ): Promise<InitiatePaymentResult> {
    if (!credentials.secretKey) {
      throw new Error("Paystack secret key is not configured for this department");
    }

    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email || `${input.phone}@no-email.umat.placeholder`,
        amount: Math.round(input.amount * 100), // GHS -> pesewas
        currency: input.currency,
        reference: input.internalReference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Paystack initialization failed: ${body}`);
    }

    const data = await res.json();
    return {
      authorizationUrl: data.data.authorization_url,
      providerReference: data.data.reference,
    };
  }

  async verifyTransaction(providerTxId: string, credentials: ProviderCredentials): Promise<VerifiedTransaction> {
    if (!credentials.secretKey) {
      throw new Error("Paystack secret key is not configured for this department");
    }

    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(providerTxId)}`, {
      headers: { Authorization: `Bearer ${credentials.secretKey}` },
    });

    if (!res.ok) {
      throw new Error(`Paystack verification failed with status ${res.status}`);
    }

    const data = await res.json();
    const tx = data.data;

    return {
      success: tx.status === "success",
      providerTxId: String(tx.id),
      internalReference: tx.reference,
      amount: tx.amount / 100,
      currency: tx.currency,
      paidAt: tx.paid_at ? new Date(tx.paid_at) : null,
      raw: tx,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null, credentials: ProviderCredentials): boolean {
    if (!signatureHeader || !credentials.secretKey) return false;
    const expected = crypto.createHmac("sha512", credentials.secretKey).update(rawBody).digest("hex");
    // Constant-time comparison to avoid timing attacks.
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  parseWebhookPayload(rawBody: string): VerifiedTransaction & { providerEventId: string } {
    const payload = JSON.parse(rawBody);
    const tx = payload.data;

    return {
      success: payload.event === "charge.success" && tx.status === "success",
      providerTxId: String(tx.id),
      internalReference: tx.reference,
      amount: tx.amount / 100,
      currency: tx.currency,
      paidAt: tx.paid_at ? new Date(tx.paid_at) : null,
      raw: payload,
      // Paystack doesn't send a distinct event id; the transaction id is unique per event stream
      // and combined with the provider name in the DB unique constraint, giving us idempotency.
      providerEventId: String(tx.id),
    };
  }
}
