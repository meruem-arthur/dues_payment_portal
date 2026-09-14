import type { EmailProvider, SendEmailInput, SendEmailResult } from "./provider.interface";

export class MockEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const attachmentNote = input.attachments?.length
      ? ` attachments=[${input.attachments.map((a) => a.filename).join(", ")}]`
      : "";
    console.log(`[MockEmail] to=${input.to} subject="${input.subject}"${attachmentNote}`);
    return { success: true };
  }
}
