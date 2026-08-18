export type SendSmsInput = {
  to: string; // phone number
  message: string;
  senderId: string;
};

export type SendSmsResult = {
  success: boolean;
  providerMessageId?: string;
  error?: string;
};

export type SmsCredentials = {
  apiKey?: string | null;
  username?: string | null;
};

export interface SMSProvider {
  send(input: SendSmsInput, credentials: SmsCredentials): Promise<SendSmsResult>;
}
