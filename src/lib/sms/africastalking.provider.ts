import type { SMSProvider, SendSmsInput, SendSmsResult, SmsCredentials } from "./provider.interface";

/**
 * Africa's Talking SMS adapter.
 *
 * Credential mapping (set per department on SmsConfiguration):
 *  - username -> Africa's Talking application username
 *                ("sandbox" while testing against the sandbox app)
 *  - apiKey   -> Africa's Talking API key for that username
 *
 * Sandbox vs live is decided by the username itself, not a separate
 * environment flag - Africa's Talking routes "sandbox" to their test
 * endpoint automatically. See https://developers.africastalking.com/docs/sms/overview.
 *
 * Note: sandbox does not actually deliver SMS to real handsets - it's for
 * verifying the integration only. Use a real (non-sandbox) username/apiKey
 * pair to send live messages.
 */
const LIVE_URL = "https://api.africastalking.com/version1/messaging";
const SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging";

export class AfricasTalkingSmsProvider implements SMSProvider {
  async send(input: SendSmsInput, credentials: SmsCredentials): Promise<SendSmsResult> {
    if (!credentials.apiKey || !credentials.username) {
      return { success: false, error: "Africa's Talking apiKey/username not configured for this department" };
    }

    const url = credentials.username === "sandbox" ? SANDBOX_URL : LIVE_URL;
    const to = normalizeGhanaPhone(input.to);

    const body = new URLSearchParams({
      username: credentials.username,
      to,
      message: input.message,
      from: input.senderId,
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          apiKey: credentials.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
    } catch (err) {
      return { success: false, error: `Network error calling Africa's Talking: ${(err as Error).message}` };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Africa's Talking request failed with status ${res.status}: ${text}` };
    }

    const data = await res.json();
    const recipient = data?.SMSMessageData?.Recipients?.[0];

    if (!recipient) {
      return { success: false, error: `Unexpected Africa's Talking response: ${JSON.stringify(data)}` };
    }

    // Africa's Talking returns statusCode 101 (or status "Success") for an
    // accepted/queued message. Anything else is a rejection (bad number,
    // insufficient balance, blocked sender id, etc).
    const success = recipient.status === "Success" || recipient.statusCode === 101;

    return {
      success,
      providerMessageId: recipient.messageId,
      error: success ? undefined : `${recipient.status ?? "Unknown"} (code ${recipient.statusCode ?? "?"})`,
    };
  }
}

/**
 * Africa's Talking expects E.164 format (+233XXXXXXXXX for Ghana). Student
 * phone numbers are collected in local format (0XXXXXXXXX) - normalize here
 * rather than forcing every entry point in the app to do it.
 */
function normalizeGhanaPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}
