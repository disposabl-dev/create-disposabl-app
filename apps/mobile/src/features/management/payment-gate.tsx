import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { billingSession } from "../../../../../packages/disposabl-kit/mobile/billing/session";
import { useWebCheckout } from "../../../../../packages/disposabl-kit/mobile/billing/web-checkout";
import { useTopup } from "../../../../../packages/disposabl-kit/mobile/billing/use-topup";
import { creditQuantity } from "../../../../../packages/disposabl-kit/payments/config";
import { Action } from "../studio/ui";
import {
  presentMonthlyPaywall,
  type BillingSnapshot,
} from "../../../../../packages/disposabl-kit/mobile/billing/paywall";

export type { BillingSnapshot } from "../../../../../packages/disposabl-kit/mobile/billing/paywall";

export function PaymentGate({
  customerId,
  data,
  refresh,
  proceed,
  cancel,
}: {
  customerId: string;
  data: BillingSnapshot | null;
  refresh: () => Promise<number | null>;
  proceed: () => void;
  cancel: () => void;
}) {
  const snapshot = useAction(api.billing.snapshot);
  const version = useRef(0);
  const awaitingReturn = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const selected = billingSession.acquire(customerId);
    version.current = selected;
    return () => billingSession.release(customerId, selected);
  }, [customerId]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void refresh().then((balance) => {
          if (awaitingReturn.current && balance !== null && balance >= 10) {
            awaitingReturn.current = false;
            proceed();
          }
        });
    });
    return () => listener.remove();
  }, [refresh, proceed]);
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const productId =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT;
  const webSnapshot = useCallback(() => snapshot({}), [snapshot]);
  const web = useWebCheckout(customerId, version, key, productId, webSnapshot);
  const topup = useTopup(customerId, version, key, webSnapshot, refresh);
  async function purchase() {
    if (
      !key ||
      !productId ||
      !data?.nativeSubscriptionsEnabled ||
      data.hasMonthlyPlan !== false ||
      data.monthlyCheckoutPending !== false ||
      busy ||
      topup.busy
    )
      return;
    if (!billingSession.beginTransaction()) return;
    setBusy(true);
    setError("");
    try {
      await billingSession.run(customerId, version.current, key, (sdk) =>
        presentMonthlyPaywall(
          sdk,
          () => snapshot({}),
          () => billingSession.current(customerId, version.current),
          productId,
        ),
      );
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error &&
          error.message ===
            "Finish or cancel your website checkout before subscribing here."
          ? error.message
          : "Store purchase is unavailable. Please try again later.",
      );
    } finally {
      billingSession.endTransaction();
      setBusy(false);
    }
  }
  return (
    <View className="gap-[18px]">
      <Text className="text-foreground text-[20px] font-semibold">
        Credits: {data?.balance ?? "unavailable"}
      </Text>
      <Text className="text-muted-foreground">
        At least 10 credits are needed to start.
      </Text>
      {data?.monthlyCheckoutPending && (
        <Text className={"text-muted-foreground"}>
          Finish or cancel your website checkout before subscribing here.
        </Text>
      )}
      {data?.nativeSubscriptionsEnabled &&
      data.hasMonthlyPlan === false &&
      key &&
      productId ? (
        <Action
          label="View subscription"
          onPress={() => void purchase()}
          disabled={
            busy ||
            web.busy ||
            topup.busy ||
            data.monthlyCheckoutPending !== false
          }
        />
      ) : (
        <Text className="text-muted-foreground">
          Store purchases are unavailable for this account.
        </Text>
      )}
      {web.available && (
        <Action
          label="Buy monthly on website"
          onPress={() => {
            awaitingReturn.current = true;
            void web.open().then((opened) => {
              if (!opened) awaitingReturn.current = false;
            });
          }}
          disabled={busy || web.busy || topup.busy}
        />
      )}
      {topup.product && (
        <Action
          label={`Buy ${creditQuantity("topup")} credits · ${topup.product.priceString}`}
          onPress={() => void topup.purchase()}
          disabled={busy || web.busy || topup.busy}
        />
      )}
      {!!topup.message && (
        <Text accessibilityRole="alert" className="text-muted-foreground">
          {topup.message}
        </Text>
      )}
      <Action
        label="Refresh credits"
        onPress={() => void refresh()}
        disabled={busy}
      />
      {data?.balance != null && data.balance >= 10 && (
        <Action label="Continue" onPress={proceed} disabled={busy} />
      )}
      <Action label="Back to idea" onPress={cancel} disabled={busy} />
      {!!error && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
      {!!web.error && (
        <Text accessibilityRole="alert" className="text-muted-foreground">
          {web.error}
        </Text>
      )}
    </View>
  );
}
