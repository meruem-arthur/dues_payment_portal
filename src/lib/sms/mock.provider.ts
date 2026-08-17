import type { SMSProvider, SendSmsInput, SendSmsResult } from "./provider.interface";

/**
 * Mock SMS provider used until real credentials (Hubtel, Africa's Talking, etc.)
 * are configured. Logs the message instead of sending it. Swap via
 * provider-factory.ts once a real provider is wired up - nothing else
 * in the app needs to change.
 */
export class MockSmsProvider implements SMSProvider {
  async send(input: SendSmsInput): Promise<SendSmsResult> {
    console.log(`[MockSMS] to=${input.to} sender=${input.senderId} message="${input.message}"`);
    return { success: true, providerMessageId: `mock-${Date.now()}` };
  }
}
