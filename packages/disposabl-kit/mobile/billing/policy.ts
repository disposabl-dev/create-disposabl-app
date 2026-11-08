import type Purchases from "react-native-purchases";

export function paymentOptions(input: {
  platform: string;
  storefront: string | null;
  paymentsEnabled: boolean;
  webCheckoutEnabled: boolean;
  nativeReady: boolean;
  canMakePayments: boolean;
}) {
  const native =
    input.paymentsEnabled && input.nativeReady && input.canMakePayments;
  return {
    native,
    web:
      native &&
      input.platform === "ios" &&
      input.storefront === "USA" &&
      input.webCheckoutEnabled,
  };
}

/** Read only through the configured, serialized billing session. */
export async function storeEligibility(
  sdk: Pick<typeof Purchases, "canMakePayments" | "getStorefront">,
  platform: string,
) {
  const canMakePayments = await sdk.canMakePayments();
  const storefront =
    platform === "ios" ? await sdk.getStorefront().catch(() => null) : null;
  return { canMakePayments, storefront: storefront?.countryCode ?? null };
}
