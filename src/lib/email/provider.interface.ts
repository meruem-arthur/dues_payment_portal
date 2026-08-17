export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  from?: string;
};

export type SendEmailResult = { success: boolean; error?: string };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
