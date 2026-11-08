import { paymentOptions } from "../../../disposabl-kit/mobile/billing/policy";
const storefront = new URLSearchParams(location.search).get("storefront");
const available = paymentOptions({
  platform: "ios",
  storefront,
  paymentsEnabled: true,
  webCheckoutEnabled: true,
  nativeReady: true,
  canMakePayments: true,
}).web;
export const useWebCheckout = () => ({
  available,
  topupAvailable: available,
  busy: false,
  error: "",
  open: async () => true,
});
