import type { PaymentProvider } from "./provider.interface";
import { PaystackProvider } from "./paystack.provider";
// import { HubtelProvider } from "./hubtel.provider"; // add when Hubtel is implemented

const providers: Record<string, PaymentProvider> = {
  PAYSTACK: new PaystackProvider(),
  // HUBTEL: new HubtelProvider(),
};

export function getPaymentProvider(providerName: "PAYSTACK" | "HUBTEL"): PaymentProvider {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Payment provider "${providerName}" is not implemented yet`);
  }
  return provider;
}
