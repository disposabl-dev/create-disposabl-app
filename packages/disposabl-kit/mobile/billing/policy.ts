import type Purchases from "react-native-purchases";
import { validMonthlyOffering, type BillingSnapshot } from "./paywall";

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

/** Recheck immediately before opening the browser, within the billing session. */
export async function preflightWebMonthly(
  sdk: Pick<
    typeof Purchases,
    "canMakePayments" | "getStorefront" | "getCustomerInfo" | "getOfferings"
  >,
  platform: string,
  productId: string,
  customerId: string,
  snapshot: () => Promise<
    BillingSnapshot & { mobileWebCheckoutEnabled: boolean; customerId: string }
  >,
  current: () => boolean,
) {
  const check = () => {
    if (!current()) throw new Error("Account changed.");
  };
  const latest = await snapshot();
  check();
  if (latest.customerId !== customerId) throw new Error("Account changed.");
  const eligibility = await storeEligibility(sdk, platform);
  check();
  const offering = (await sdk.getOfferings()).current;
  check();
  const options = paymentOptions({
    platform,
    ...eligibility,
    paymentsEnabled: true,
    webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
    nativeReady:
      latest.nativeSubscriptionsEnabled &&
      !!offering &&
      validMonthlyOffering(offering.availablePackages, productId),
  });
  if (!options.web) throw new Error("Website checkout is unavailable.");
  if (latest.hasMonthlyPlan !== false) throw new Error("existing_subscription");
  const customer = await sdk.getCustomerInfo();
  check();
  if (customer.activeSubscriptions.length)
    throw new Error("existing_subscription");
}
