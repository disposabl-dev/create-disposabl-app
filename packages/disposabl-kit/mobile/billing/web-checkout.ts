import { useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { billingSession } from "./session";
import {
  paymentOptions,
  preflightWebMonthly,
  storeEligibility,
} from "./policy";
import { validMonthlyOffering, type BillingSnapshot } from "./paywall";

const create = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { url: string; userId: string }
>("billingHandoff:create");
type Snapshot = BillingSnapshot & {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lifecycle = useRef({ sequence: 0 });
  const refresh = useCallback(
    async (generation: number) => {
      const seq = ++lifecycle.current.sequence;
      setAvailable(false);
      if (Platform.OS !== "ios" || !key || !productId) return;
      try {
        const latest = await snapshot();
        if (latest.customerId !== customerId) return;
        const value = await billingSession.run(
          customerId,
          generation,
          key,
          async (sdk) => {
            const eligibility = await storeEligibility(sdk, Platform.OS);
            const offering = (await sdk.getOfferings()).current;
            return paymentOptions({
              platform: Platform.OS,
              ...eligibility,
              paymentsEnabled: true,
              webCheckoutEnabled: latest.mobileWebCheckoutEnabled,
              nativeReady:
                latest.nativeSubscriptionsEnabled &&
                !!offering &&
                validMonthlyOffering(offering.availablePackages, productId),
            }).web;
          },
        );
        if (
          seq === lifecycle.current.sequence &&
          billingSession.current(customerId, generation)
        )
          setAvailable(value && latest.hasMonthlyPlan === false);
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
  async function open() {
    if (!available || !key || !productId || !billingSession.beginTransaction())
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
          await preflightWebMonthly(
            sdk,
            Platform.OS,
            productId,
            customerId,
            snapshot,
            current,
          );
          return handoff({});
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
    busy,
    error,
    open,
    refresh: () => refresh(version.current),
  };
}
