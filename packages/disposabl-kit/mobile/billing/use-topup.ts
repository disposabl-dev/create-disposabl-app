import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import type { PurchasesStoreProduct } from "react-native-purchases";
import { billingSession } from "./session";
import {
  loadTopup,
  matchingTopupRoute,
  purchaseTopup,
  type TopupSnapshot,
} from "./topup";

const app =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_APP_ID
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_APP_ID;
const productId =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_TOPUP_PRODUCT
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_TOPUP_PRODUCT;

export function useTopup(
  customerId: string,
  version: React.RefObject<number>,
  key: string | undefined,
  snapshot: () => Promise<TopupSnapshot>,
  refreshBalance: () => Promise<unknown>,
) {
  const [product, setProduct] = useState<PurchasesStoreProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lifecycle = useRef({ sequence: 0 });
  const refresh = useCallback(
    async (generation: number) => {
      const seq = ++lifecycle.current.sequence;
      await Promise.resolve();
      if (seq !== lifecycle.current.sequence) return;
      setProduct(null);
      if (!key || !app || !productId) return;
      try {
        const latest = await snapshot();
        if (
          latest.customerId !== customerId ||
          !matchingTopupRoute(latest, Platform.OS, app, productId)
        )
          return;
        const result = await billingSession.run(
          customerId,
          generation,
          key,
          async (sdk) => {
            if (
              !(await sdk.canMakePayments()) ||
              (await sdk.getAppUserID()) !== customerId
            )
              return null;
            return loadTopup(sdk, Platform.OS, productId);
          },
        );
        if (
          seq === lifecycle.current.sequence &&
          billingSession.current(customerId, generation)
        )
          setProduct(result);
      } catch {
        /* Unavailable until next refresh. */
      }
    },
    [customerId, key, snapshot],
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
  async function purchase() {
    if (!product || !key || !billingSession.beginTransaction()) return;
    const generation = version.current;
    const current = () => billingSession.current(customerId, generation);
    setBusy(true);
    setMessage("");
    try {
      await billingSession.run(customerId, generation, key, (sdk) =>
        purchaseTopup(
          sdk,
          snapshot,
          current,
          customerId,
          Platform.OS,
          app,
          productId,
        ),
      );
      if (current())
        setMessage("Purchase received. Credits appear after payment sync.");
    } catch (error) {
      if (current())
        setMessage(
          (error as { userCancelled?: boolean })?.userCancelled
            ? "Purchase cancelled."
            : "Store purchase unavailable. Refresh before trying again.",
        );
    } finally {
      billingSession.endTransaction();
      if (current()) setBusy(false);
    }
    if (current()) await refreshBalance().catch(() => undefined);
  }
  return { product, busy, message, purchase };
}
