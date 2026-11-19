import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { billingSession } from "../../../../../packages/disposabl-kit/mobile/billing/session";
import { useTopup } from "../../../../../packages/disposabl-kit/mobile/billing/use-topup";
import { creditQuantity } from "../../../../../packages/disposabl-kit/payments/config";
import { Action } from "../studio/ui";
import { captureProductAction } from "../product-telemetry";
import {
  monthlyOfferingId,
  purchaseMonthlySubscription,
  selectMonthlyOffering,
  type BillingSnapshot,
} from "../../../../../packages/disposabl-kit/mobile/billing/paywall";

export type { BillingSnapshot } from "../../../../../packages/disposabl-kit/mobile/billing/paywall";

export function PaymentGate({
  customerId,
  data,
  refresh,
  proceed,
  cancel,
  resume = false,
}: {
  customerId: string;
  data: BillingSnapshot | null;
  refresh: () => Promise<number | null>;
  proceed: () => void;
  cancel: () => void;
  resume?: boolean;
}) {
  const snapshot = useAction(api.billing.snapshot);
  const version = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const selected = billingSession.acquire(customerId);
    version.current = selected;
    return () => billingSession.release(customerId, selected);
  }, [customerId]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch(() => undefined);
    });
    return () => listener.remove();
  }, [refresh]);
  const key =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const productId =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT;
  const [monthlyReadyFor, setMonthlyReadyFor] = useState<{
    customerId: string;
    price: string;
  } | null>(null);
  useEffect(() => {
    if (!key || !productId) return;
    let active = true;
    let sequence = 0;
    const update = async () => {
      const request = ++sequence;
      setMonthlyReadyFor(null);
      try {
        const ready = await billingSession.run(
          customerId,
          version.current,
          key,
          async (sdk) => {
            const canPay = await sdk.canMakePayments();
            const offerings = await sdk.getOfferings();
            const offering = selectMonthlyOffering(
              offerings,
              productId,
              monthlyOfferingId,
            );
            return canPay
              ? offering?.availablePackages[0]?.product.priceString
              : undefined;
          },
        );
        if (active && request === sequence && ready)
          setMonthlyReadyFor({ customerId, price: ready });
      } catch {
        // The selected offering remains unavailable until a successful refresh.
      }
    };
    void update();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void update();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [customerId, key, productId]);
  const monthlyReady = monthlyReadyFor?.customerId === customerId;
  const fetchSnapshot = useCallback(() => snapshot({}), [snapshot]);
  const topup = useTopup(customerId, version, key, fetchSnapshot, refresh);
  async function purchase() {
    if (
      !key ||
      !productId ||
      !monthlyReady ||
      !data?.nativeSubscriptionsEnabled ||
      data.hasMonthlyPlan !== false ||
      data.monthlyCheckoutPending !== false ||
      busy ||
      !billingSession.current(customerId, version.current) ||
      topup.busy
    )
      return;
    if (!billingSession.beginTransaction()) return;
    captureProductAction("billing_native_subscription_attempt");
    const generation = version.current;
    const current = () => billingSession.current(customerId, generation);
    setBusy(true);
    setError("");
    try {
      await billingSession.run(customerId, generation, key, (sdk) =>
        purchaseMonthlySubscription(
          sdk,
          () => snapshot({}),
          current,
          productId,
          monthlyOfferingId,
        ),
      );
      if (current()) await refresh();
    } catch (error) {
      if (current() && !(error as { userCancelled?: boolean })?.userCancelled)
        setError(
          error instanceof Error &&
            error.message ===
              "Finish or cancel your website checkout before subscribing here."
            ? error.message
            : "Store purchase is unavailable. Please try again later.",
        );
    } finally {
      billingSession.endTransaction();
      if (current()) setBusy(false);
    }
  }
  function checkout() {
    if (
      !key ||
      busy ||
      topup.busy ||
      !billingSession.current(customerId, version.current)
    )
      return;
    if (topup.product) {
      captureProductAction("billing_native_topup_attempt");
      void topup.purchase();
    }
  }
  return (
    <View className="gap-[18px]">
      <Text className="text-foreground text-[20px] font-semibold">
        Credits: {data?.balance ?? "unavailable"}
      </Text>
      <Text className="text-muted-foreground">
        Each 10-minute sandbox window costs 10 credits, paid upfront. Your apps
        share one sandbox. AI is currently included.
      </Text>
      {resume && (
        <Text className="text-muted-foreground">
          If your sandbox has stopped, add credits if needed, then return to
          your message and tap Send to resume. Refreshing credits will not send
          it.
        </Text>
      )}
      {data?.monthlyCheckoutPending && (
        <Text className={"text-muted-foreground"}>
          Finish or cancel your website checkout before subscribing here.
        </Text>
      )}
      {data?.nativeSubscriptionsEnabled &&
      data.hasMonthlyPlan === false &&
      key &&
      productId &&
      monthlyReady ? (
        <Action
          label={`${creditQuantity("monthly")} credits · ${monthlyReadyFor?.price}/month`}
          onPress={() => void purchase()}
          disabled={busy || topup.busy || data.monthlyCheckoutPending !== false}
        />
      ) : null}
      {topup.product && (
        <Action
          label={`Buy ${creditQuantity("topup")} credits · ${topup.product.priceString}`}
          onPress={checkout}
          disabled={busy || topup.busy}
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
      {!resume && data?.balance != null && data.balance >= 10 && (
        <Action label="Continue" onPress={proceed} disabled={busy} />
      )}
      <Action
        label={resume ? "Back to message" : "Back to idea"}
        onPress={cancel}
        disabled={busy}
      />
      {!!error && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
    </View>
  );
}
