import Constants from "expo-constants";
import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { billingSession } from "./session";
import {
  paymentOptions,
  preflightWebMonthly,
  preflightWebTopup,
  storeEligibility,
} from "./policy";
import {
  monthlyOfferingId,
  selectMonthlyOffering,
  type BillingSnapshot,
} from "./paywall";
import { loadTopup, matchingTopupRoute, type TopupSnapshot } from "./topup";

const topupApp = process.env.EXPO_PUBLIC_REVENUECAT_IOS_APP_ID;
const topupProduct = process.env.EXPO_PUBLIC_REVENUECAT_IOS_TOPUP_PRODUCT;

const create = makeFunctionReference<
  "mutation",
  { purchase: "monthly" | "topup"; returnChannel?: string },
  { url: string; userId: string }
>("billingHandoff:create");
type Snapshot = BillingSnapshot &
  TopupSnapshot & {
    mobileWebCheckoutEnabled: boolean;
    customerId: string;
  };
export function useWebCheckout(
  customerId: string,
  version: React.RefObject<number>,
  key: string | undefined,
  productId: string | undefined,
  snapshot: () => Promise<Snapshot>,
) {
  const handoff = useMutation(create);
  const [available, setAvailable] = useState(false);
  const [topupAvailable, setTopupAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lifecycle = useRef({ sequence: 0 });
  const refresh = useCallback(
    async (generation: number) => {
      const seq = ++lifecycle.current.sequence;
      setAvailable(false);
      setTopupAvailable(false);
      if (Platform.OS !== "ios" || !key) return;
      try {
        const latest = await snapshot();
        if (latest.customerId !== customerId) return;
        const value = await billingSession.run(
          customerId,
          generation,
          key,
          async (sdk) => {
            const eligibility = await storeEligibility(sdk, Platform.OS);
            const offerings = productId
              ? await sdk.getOfferings().catch(() => null)
              : null;
            const offering =
              offerings && productId
                ? selectMonthlyOffering(offerings, productId, monthlyOfferingId)
                : null;
            const common = {
              platform: Platform.OS,
              ...eligibility,
              paymentsEnabled: true,
              webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
            };
            const topup =
              matchingTopupRoute(latest, Platform.OS, topupApp, topupProduct) &&
              (await sdk.getAppUserID()) === customerId &&
              topupProduct
                ? await loadTopup(sdk, Platform.OS, topupProduct).catch(
                    () => null,
                  )
                : null;
            return {
              topup: paymentOptions({ ...common, nativeReady: !!topup }).web,
              monthly: paymentOptions({
                platform: Platform.OS,
                ...eligibility,
                paymentsEnabled: true,
                webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
                nativeReady: latest.nativeSubscriptionsEnabled && !!offering,
              }).web,
            };
          },
        );
        if (
          seq === lifecycle.current.sequence &&
          billingSession.current(customerId, generation)
        ) {
          setAvailable(value.monthly && latest.hasMonthlyPlan === false);
          setTopupAvailable(value.topup);
        }
      } catch {
        /* Fail closed until the next refresh. */
      }
    },
    [customerId, key, productId, snapshot],
  );
  useEffect(() => {
    const state = lifecycle.current;
    const update = () => void refresh(version.current);
    update();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      state.sequence++;
      listener.remove();
    };
  }, [refresh, version]);
  async function open(purchase: "monthly" | "topup" = "monthly") {
    if (
      !(purchase === "monthly" ? available && productId : topupAvailable) ||
      !key ||
      !billingSession.beginTransaction()
    )
      return false;
    const generation = version.current;
    const current = () => billingSession.current(customerId, generation);
    setBusy(true);
    setError("");
    try {
      const handoffResult = await billingSession.run(
        customerId,
        generation,
        key,
        async (sdk) => {
          if (purchase === "monthly")
            await preflightWebMonthly(
              sdk,
              Platform.OS,
              productId!,
              customerId,
              snapshot,
              current,
              monthlyOfferingId,
            );
          else
            await preflightWebTopup(
              sdk,
              Platform.OS,
              topupApp,
              topupProduct,
              customerId,
              snapshot,
              current,
            );
          if (!current()) throw new Error("Account changed.");
          const returnChannel =
            Constants.expoConfig?.extra?.billingReturnChannel;
          return handoff({
            purchase,
            ...(typeof returnChannel === "string" ? { returnChannel } : {}),
          });
        },
      );
      const parsed = new URL(handoffResult.url);
      if (
        !current() ||
        handoffResult.userId !== customerId ||
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/billing-login" ||
        parsed.search ||
        !/^#[A-Za-z0-9_-]{43}$/.test(parsed.hash)
      )
        throw new Error("Invalid browser link.");
      await Linking.openURL(handoffResult.url);
      if (current())
        setError("Return to the app and refresh credits after checkout.");
      return true;
    } catch {
      if (current()) {
        setAvailable(false);
        setTopupAvailable(false);
        setError("Website checkout is unavailable. Refresh and try again.");
      }
      return false;
    } finally {
      billingSession.endTransaction();
      if (current()) setBusy(false);
    }
  }
  return {
    available,
    topupAvailable,
    busy,
    error,
    open,
    refresh: () => refresh(version.current),
  };
}
