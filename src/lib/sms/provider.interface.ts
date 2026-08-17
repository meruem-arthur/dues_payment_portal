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

export interface SMSProvider {
  send(input: SendSmsInput): Promise<SendSmsResult>;
}
