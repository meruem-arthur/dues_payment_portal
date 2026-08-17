import type { EmailProvider, SendEmailInput, SendEmailResult } from "./provider.interface";

export class MockEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    console.log(`[MockEmail] to=${input.to} subject="${input.subject}"`);
    return { success: true };
  }
}
