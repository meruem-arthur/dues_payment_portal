import type { SMSProvider } from "./provider.interface";
import { MockSmsProvider } from "./mock.provider";
import { AfricasTalkingSmsProvider } from "./africastalking.provider";

/**
 * SMS_PROVIDER selects the adapter app-wide (all departments share the same
 * provider integration; each department supplies its own apiKey/username
 * on SmsConfiguration, passed in separately at send() time). Falls back to
 * the mock provider - which only logs, never actually sends - if unset.
 */
export function getSmsProvider(): SMSProvider {
  if (process.env.SMS_PROVIDER === "AFRICASTALKING") {
    return new AfricasTalkingSmsProvider();
  }
  return new MockSmsProvider();
}
