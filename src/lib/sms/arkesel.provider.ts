import type { SMSProvider, SendSmsInput, SendSmsResult, SmsCredentials } from "./provider.interface";

/**
 * Arkesel SMS adapter (v2 JSON API).
 *
 * Credential mapping (set per department on SmsConfiguration):
 *  - apiKey -> Arkesel API key, sent in the `api-key` header.
 *  - username -> not used by Arkesel at all (that field only exists on
 *    SmsCredentials because Africa's Talking needs it) - safely ignored
 *    here.
 *
 * There's no sandbox/live distinction in the request itself the way
 * Africa's Talking has one - Arkesel uses a single endpoint and account,
 * and test vs live is really just "do you have real credits loaded".
 *
 * Endpoint + request/response shape per https://arkesel.com/developer-api/sms-api/
 * (fetched directly from Arkesel's own docs, not memorized):
 *   POST https://sms.arkesel.com/api/v2/sms/send
 *   Headers: api-key: <key>, Content-Type: application/json
 *   Body:    { sender, message, recipients: string[] }
 *   Success: 200 { "status": "success", "data": { "id": "...", "credits_used": N } }
 */
const SEND_URL = "https://sms.arkesel.com/api/v2/sms/send";

export class ArkeselSmsProvider implements SMSProvider {
  async send(input: SendSmsInput, credentials: SmsCredentials): Promise<SendSmsResult> {
    if (!credentials.apiKey) {
      return { success: false, error: "Arkesel apiKey not configured for this department" };
    }

    const to = normalizeGhanaPhone(input.to);

    let res: Response;
    try {
      res = await fetch(SEND_URL, {
        method: "POST",
        headers: {
          "api-key": credentials.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Arkesel sender IDs are capped at 11 chars, same constraint
          // already enforced in smsConfigSchema.senderId - if it's empty
          // (unapproved sender ID left blank, same convention as the
          // Africa's Talking adapter), fall back to a generic sender
          // rather than sending an empty string, since Arkesel's API
          // requires this field.
          sender: input.senderId?.trim() || "UMaTDues",
          message: input.message,
          recipients: [to],
        }),
      });
    } catch (err) {
      return { success: false, error: `Network error calling Arkesel: ${(err as Error).message}` };
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      return { success: false, error: `Unexpected Arkesel response (status ${res.status}): ${text}` };
    }

    if (!res.ok || data?.status !== "success") {
      return {
        success: false,
        error: data?.message ?? `Arkesel request failed with status ${res.status}: ${JSON.stringify(data)}`,
      };
    }

    return {
      success: true,
      providerMessageId: data?.data?.id,
    };
  }
}

/**
 * Arkesel expects E.164 format (+233XXXXXXXXX for Ghana), same as Africa's
 * Talking - student phone numbers are collected in local format
 * (0XXXXXXXXX), so normalize here rather than forcing every entry point in
 * the app to do it.
 */
function normalizeGhanaPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}
