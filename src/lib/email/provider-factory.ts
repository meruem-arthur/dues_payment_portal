import type { EmailProvider } from "./provider.interface";
import { MockEmailProvider } from "./mock.provider";
import { BrevoEmailProvider } from "./brevo.provider";

/**
 * EMAIL_PROVIDER selects the adapter app-wide - same convention as
 * SMS_PROVIDER (see src/lib/sms/provider-factory.ts). Falls back to the
 * mock provider - which only logs, never actually sends - if unset.
 */
export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "BREVO") {
    return new BrevoEmailProvider();
  }
  return new MockEmailProvider();
}
