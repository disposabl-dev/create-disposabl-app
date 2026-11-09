import type Purchases from "react-native-purchases";
import type {
  PurchasesOffering,
  PurchasesOfferings,
} from "react-native-purchases";

export type BillingSnapshot = {
  balance: number | null;
  hasMonthlyPlan: boolean | null;
  nativeSubscriptionsEnabled: boolean;
  monthlyCheckoutPending: boolean;
};

type Store = Pick<
  typeof Purchases,
  "getCustomerInfo" | "getOfferings" | "canMakePayments"
>;
type Outcome = "purchased" | "restored" | "cancelled";

/** Reject mixed offerings until top-up synchronization is verified. */
export function validMonthlyOffering(
  packages: {
    product: { identifier: string; subscriptionPeriod: string | null };
  }[],
  productId: string,
) {
  return (
    packages.length === 1 &&
    packages[0].product.identifier === productId &&
    packages[0].product.subscriptionPeriod === "P1M"
  );
}

// Expo inlines this public build-time value in the mobile bundle.
export const monthlyOfferingId = process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID;

/** Validate the complete selected offering, never a filtered package list. */
export function selectMonthlyOffering(
  offerings: PurchasesOfferings,
  productId: string,
  offeringId?: string,
): PurchasesOffering | null {
  const id = offeringId?.trim();
  const offering = id
    ? Object.hasOwn(offerings.all, id)
      ? offerings.all[id]
      : null
    : offerings.current;
  return offering && validMonthlyOffering(offering.availablePackages, productId)
    ? offering
    : null;
}

/** Must run inside BillingSession.run so identity changes are serialized. */
export async function presentMonthlyPaywall(
  sdk: Store,
  getSnapshot: () => Promise<BillingSnapshot>,
  current: () => boolean,
  productId: string,
  present: (
    offering: PurchasesOffering,
    current: () => boolean,
  ) => Promise<Outcome> = showPaywall,
  offeringId?: string,
): Promise<Outcome> {
  const check = () => {
    if (!current()) throw new Error("Account changed.");
  };
  const snapshot = await getSnapshot();
  check();
  if (snapshot.monthlyCheckoutPending !== false)
    throw new Error(
      "Finish or cancel your website checkout before subscribing here.",
    );
  if (!snapshot.nativeSubscriptionsEnabled || snapshot.hasMonthlyPlan !== false)
    throw new Error("existing_subscription");
  if (!(await sdk.canMakePayments()))
    throw new Error("Payments are restricted.");
  check();
  const info = await sdk.getCustomerInfo();
  check();
  if (info.activeSubscriptions.length) throw new Error("existing_subscription");
  const offerings = await sdk.getOfferings();
  check();
  const offering = selectMonthlyOffering(offerings, productId, offeringId);
  if (!offering) throw new Error("Store offering is unavailable.");
  const outcome = await present(offering, current);
  check();
  return outcome;
}

async function showPaywall(
  offering: PurchasesOffering,
  current: () => boolean,
): Promise<Outcome> {
  const { default: ui, PAYWALL_RESULT } =
    await import("react-native-purchases-ui");
  if (!current()) throw new Error("Account changed.");
  const result = await ui.presentPaywall({
    offering,
    displayCloseButton: true,
  });
  if (result === PAYWALL_RESULT.PURCHASED) return "purchased";
  if (result === PAYWALL_RESULT.RESTORED) return "restored";
  if (result === PAYWALL_RESULT.CANCELLED) return "cancelled";
  throw new Error("Store offering is unavailable.");
}
