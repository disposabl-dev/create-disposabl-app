import type Purchases from "react-native-purchases";
import { selectMonthlyOffering, type BillingSnapshot } from "./paywall";
import { loadTopup, matchingTopupRoute, type TopupSnapshot } from "./topup";

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
  offeringId?: string,
) {
  const check = () => {
    if (!current()) throw new Error("Account changed.");
  };
  const latest = await snapshot();
  check();
  if (latest.customerId !== customerId) throw new Error("Account changed.");
  const eligibility = await storeEligibility(sdk, platform);
  check();
  const offerings = await sdk.getOfferings();
  check();
  const offering = selectMonthlyOffering(offerings, productId, offeringId);
  const options = paymentOptions({
    platform,
    ...eligibility,
    paymentsEnabled: true,
    webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
    nativeReady: latest.nativeSubscriptionsEnabled && !!offering,
  });
  if (!options.web) throw new Error("Website checkout is unavailable.");
  if (latest.hasMonthlyPlan !== false) throw new Error("existing_subscription");
  const customer = await sdk.getCustomerInfo();
  check();
  if (customer.activeSubscriptions.length)
    throw new Error("existing_subscription");
}

/** The matching route and real consumable must still exist at the moment of handoff. */
export async function preflightWebTopup(
  sdk: Pick<
    typeof Purchases,
    | "canMakePayments"
    | "getStorefront"
    | "getAppUserID"
    | "getProducts"
    | "PRODUCT_CATEGORY"
    | "purchaseStoreProduct"
  >,
  platform: string,
  app: string | undefined,
  productId: string | undefined,
  customerId: string,
  snapshot: () => Promise<
    TopupSnapshot & { mobileWebCheckoutEnabled: boolean }
  >,
  current: () => boolean,
) {
  const check = () => {
    if (!current()) throw new Error("Account changed.");
  };
  const latest = await snapshot();
  check();
  if (
    latest.customerId !== customerId ||
    !matchingTopupRoute(latest, platform, app, productId)
  )
    throw new Error("Top-up unavailable.");
  const eligibility = await storeEligibility(sdk, platform);
  check();
  if ((await sdk.getAppUserID()) !== customerId)
    throw new Error("Account changed.");
  check();
  const product = await loadTopup(sdk, platform, productId!);
  check();
  if (
    !paymentOptions({
      platform,
      ...eligibility,
      paymentsEnabled: true,
      webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
      nativeReady: !!product,
    }).web
  )
    throw new Error("Website checkout is unavailable.");
}
