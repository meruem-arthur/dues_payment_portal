import crypto from "crypto";
import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifiedTransaction,
  ProviderCredentials,
} from "./provider.interface";

const HUBTEL_BASE_URL = "https://payproxyapi.hubtel.com";

/**
 * Hubtel Online Checkout adapter.
 *
 * Credential mapping (set on the department's PaymentProviderConfiguration):
 *  - publicKey    -> Hubtel Client ID
 *  - secretKey    -> Hubtel Client Secret
 *  - configValue  -> Hubtel Merchant Account Number (POS Sales ID)
 *  - webhookSecret -> a secret WE generate and append to the callback URL as
 *                      ?token=... , since Hubtel does not sign its webhook
 *                      callbacks the way Paystack does. We treat a matching
 *                      token, combined with a clientReference that matches a
 *                      PENDING payment we created, as proof of authenticity.
 *
 * NOTE: field names below reflect Hubtel's public Online Checkout docs at
 * the time this was written. Confirm against
 * https://developers.hubtel.com before going live - payment provider APIs
 * change, and this adapter is the only place that needs updating if they do.
 */
export class HubtelProvider implements PaymentProvider {
  readonly name = "HUBTEL" as const;

  private authHeader(credentials: ProviderCredentials): string {
    if (!credentials.publicKey || !credentials.secretKey) {
      throw new Error("Hubtel Client ID and Client Secret are not configured for this department");
    }
    const token = Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString("base64");
    return `Basic ${token}`;
  }

  async initiatePayment(
    input: InitiatePaymentInput,
    credentials: ProviderCredentials
  ): Promise<InitiatePaymentResult> {
    if (!credentials.configValue) {
      throw new Error("Hubtel Merchant Account Number is not configured for this department");
    }

    // Unlike Paystack (whose `callback_url` is only the browser redirect,
    // with the webhook configured separately in the Paystack dashboard),
    // Hubtel's `callbackUrl` IS the server-to-server webhook. We point that
    // at our own webhook route and use input.callbackUrl (the student-facing
    // payment-status page) for the browser redirect instead. The webhook
    // secret is appended as a query token so the webhook handler can confirm
    // the callback genuinely belongs to a checkout session we created.
    const webhookUrl = credentials.webhookSecret
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/hubtel?token=${encodeURIComponent(credentials.webhookSecret)}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/hubtel`;

    const res = await fetch(`${HUBTEL_BASE_URL}/items/initiate`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        totalAmount: input.amount,
        description: `Dues payment - ${input.metadata.paymentType} (${input.metadata.studentReference})`,
        callbackUrl: webhookUrl,
        returnUrl: input.callbackUrl,
        cancellationUrl: input.callbackUrl,
        merchantAccountNumber: credentials.configValue,
        clientReference: input.internalReference,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Hubtel checkout initialization failed: ${body}`);
    }

    const data = await res.json();
    if (data.code !== "200" && data.responseCode !== "0000") {
      throw new Error(`Hubtel checkout initialization failed: ${JSON.stringify(data)}`);
    }

    return {
      authorizationUrl: data.data.checkoutUrl,
      providerReference: data.data.checkoutId ?? input.internalReference,
    };
  }

  async verifyTransaction(providerTxId: string, credentials: ProviderCredentials): Promise<VerifiedTransaction> {
    const res = await fetch(`${HUBTEL_BASE_URL}/transaction/${encodeURIComponent(providerTxId)}`, {
      headers: { Authorization: this.authHeader(credentials) },
    });

    if (!res.ok) {
      throw new Error(`Hubtel verification failed with status ${res.status}`);
    }

    const data = await res.json();
    const tx = data.data ?? data.Data;
    const status = String(tx?.status ?? tx?.Status ?? "").toLowerCase();

    return {
      success: status === "completed" || status === "success",
      providerTxId: String(tx?.transactionId ?? tx?.TransactionId ?? providerTxId),
      internalReference: tx?.clientReference ?? tx?.ClientReference ?? "",
      amount: Number(tx?.amount ?? tx?.Amount ?? 0),
      currency: "GHS",
      paidAt: status === "completed" || status === "success" ? new Date() : null,
      raw: data,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null, credentials: ProviderCredentials): boolean {
    // Hubtel does not sign webhook payloads. We instead require the shared
    // token we embedded in the callback URL at initiation time to be present
    // and matching. The route handler passes that token in as signatureHeader.
    if (!credentials.webhookSecret || !signatureHeader) return false;
    const a = Buffer.from(credentials.webhookSecret);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  parseWebhookPayload(rawBody: string): VerifiedTransaction & { providerEventId: string } {
    const payload = JSON.parse(rawBody);
    const tx = payload.Data ?? payload.data ?? payload;
    const status = String(tx?.Status ?? tx?.status ?? "").toLowerCase();

    const providerTxId = String(tx?.TransactionId ?? tx?.transactionId ?? tx?.CheckoutId ?? tx?.checkoutId ?? "");

    return {
      success: status === "success" || status === "completed" || status === "paid",
      providerTxId,
      internalReference: tx?.ClientReference ?? tx?.clientReference ?? "",
      amount: Number(tx?.Amount ?? tx?.amount ?? 0),
      currency: "GHS",
      paidAt: new Date(),
      raw: payload,
      // Hubtel callbacks don't include a distinct event id; the transaction
      // id combined with provider name in the DB unique constraint gives
      // idempotency the same way the Paystack adapter relies on it.
      providerEventId: providerTxId || String(tx?.ClientReference ?? tx?.clientReference ?? Date.now()),
    };
  }
}
