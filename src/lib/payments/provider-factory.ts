import type { PaymentProvider } from "./provider.interface";
import { PaystackProvider } from "./paystack.provider";
import { HubtelProvider } from "./hubtel.provider";

// Adding a new provider is: implement PaymentProvider in its own file,
// then register it here. Nothing else in the app should ever import a
// provider class directly - always go through getPaymentProvider().
const providers: Record<string, PaymentProvider> = {
  PAYSTACK: new PaystackProvider(),
  HUBTEL: new HubtelProvider(),
};

export function getPaymentProvider(providerName: "PAYSTACK" | "HUBTEL"): PaymentProvider {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Payment provider "${providerName}" is not implemented yet`);
  }
  return provider;
}
