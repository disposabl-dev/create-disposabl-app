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
  monthlyOfferingId,
  presentMonthlyPaywall,
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
}: {
  customerId: string;
  data: BillingSnapshot | null;
  refresh: () => Promise<number | null>;
  proceed: () => void;
  cancel: () => void;
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
  const [monthlyReadyFor, setMonthlyReadyFor] = useState<string | null>(null);
  useEffect(() => {
    if (!monthlyOfferingId?.trim() || !key || !productId) return;
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
            return (
              canPay &&
              !!selectMonthlyOffering(offerings, productId, monthlyOfferingId)
            );
          },
        );
        if (active && request === sequence && ready)
          setMonthlyReadyFor(customerId);
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
  const monthlyReady =
    !monthlyOfferingId?.trim() || monthlyReadyFor === customerId;
  const webSnapshot = useCallback(() => snapshot({}), [snapshot]);
  const web = useWebCheckout(customerId, version, key, productId, webSnapshot);
  const topup = useTopup(customerId, version, key, webSnapshot, refresh);
  async function purchase() {
    if (
      !key ||
      !productId ||
      !monthlyReady ||
      !data?.nativeSubscriptionsEnabled ||
      data.hasMonthlyPlan !== false ||
      data.monthlyCheckoutPending !== false ||
      busy ||
      topup.busy
    )
      return;
    if (!billingSession.beginTransaction()) return;
    const generation = version.current;
    const current = () => billingSession.current(customerId, generation);
    setBusy(true);
    setError("");
    try {
      await billingSession.run(customerId, generation, key, (sdk) =>
        presentMonthlyPaywall(
          sdk,
          () => snapshot({}),
          current,
          productId,
          undefined,
          monthlyOfferingId,
        ),
      );
      if (current()) await refresh();
    } catch (error) {
      if (current())
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
      productId &&
      monthlyReady ? (
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
          onPress={() => void web.open()}
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
      {web.topupAvailable && (
        <Action
          label="Buy top-up on website"
          disabled={busy || web.busy || topup.busy}
          onPress={() => void web.open("topup")}
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
