import type { SMSProvider } from "./provider.interface";
import { MockSmsProvider } from "./mock.provider";
// import { HubtelSmsProvider } from "./hubtel-sms.provider"; // add when configured

export function getSmsProvider(): SMSProvider {
  // For MVP, always mock unless real credentials are present in env.
  if (process.env.SMS_PROVIDER_API_KEY) {
    // return new HubtelSmsProvider();
  }
  return new MockSmsProvider();
}
