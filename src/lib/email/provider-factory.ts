import type { EmailProvider } from "./provider.interface";
import { MockEmailProvider } from "./mock.provider";
// import { ResendEmailProvider } from "./resend.provider"; // add when configured

export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_API_KEY) {
    // return new ResendEmailProvider();
  }
  return new MockEmailProvider();
}
