import type { EmailProvider, SendEmailInput, SendEmailResult } from "./provider.interface";

/**
 * Brevo (formerly Sendinblue) transactional email adapter.
 *
 * Unlike SMS - where each department supplies its own Africa's Talking
 * apiKey/username - email is architected as ONE shared Brevo account for
 * the whole app: a single EMAIL_API_KEY env var, set once. Per-department
 * EmailConfiguration only controls fromAddress/enabled/emailTemplate, not
 * credentials. If a department ever needs its own separate email account,
 * that's a bigger change (credentials would need to move onto
 * EmailConfiguration and be encrypted at rest like SmsConfiguration.apiKey -
 * see src/lib/crypto/field-encryption.ts).
 *
 * Brevo's free tier caps at 300 emails/day account-wide (not per
 * department) - see https://www.brevo.com/pricing/. Nothing in this app
 * enforces that quota; Brevo's API simply starts rejecting sends once it's
 * hit, and that rejection surfaces as an ordinary failed SendEmailResult
 * (logged to NotificationLog, same as any other send failure) rather than
 * anything special-cased here. If dues volume ever regularly exceeds 300
 * emails/day, upgrading the Brevo plan is a billing change, not a code one.
 *
 * A "from" sender must be verified in the Brevo dashboard first - Brevo
 * rejects sends from an unverified address. fromAddress on a department's
 * EmailConfiguration is expected to be one of those verified senders;
 * EMAIL_FROM_ADDRESS/EMAIL_FROM_NAME are the account-wide fallback when a
 * department hasn't set its own.
 *
 * https://developers.brevo.com/reference/sendtransacemail
 */
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export class BrevoEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.EMAIL_API_KEY;
    if (!apiKey) {
      return { success: false, error: "EMAIL_API_KEY is not configured" };
    }

    const senderEmail = input.from || process.env.EMAIL_FROM_ADDRESS;
    if (!senderEmail) {
      return {
        success: false,
        error: "No sender address available - set a department fromAddress or the EMAIL_FROM_ADDRESS fallback",
      };
    }

    const payload = {
      sender: { email: senderEmail, name: process.env.EMAIL_FROM_NAME || "UMaT Departmental Dues" },
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.body,
    };

    let res: Response;
    try {
      res = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return { success: false, error: `Network error calling Brevo: ${(err as Error).message}` };
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      // Brevo error bodies are typically { code, message } - e.g. hitting
      // the 300/day free-tier cap comes back as a 402 with a plan-limit
      // message. Fall back to raw status if the body didn't parse.
      const detail = data?.message ? `${data.code ?? "error"}: ${data.message}` : `HTTP ${res.status}`;
      return { success: false, error: `Brevo request failed - ${detail}` };
    }

    return { success: true };
  }
}
