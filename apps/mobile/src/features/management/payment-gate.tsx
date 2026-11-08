import { useAction } from "convex/react";
import { api } from "../../../../../packages/backend/convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { billingSession } from "../../../../../packages/disposabl-kit/mobile/billing/session";
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
  refresh: () => Promise<void>;
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
      if (state === "active") void refresh();
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
  async function purchase() {
    if (
      !key ||
      !productId ||
      !data?.nativeSubscriptionsEnabled ||
      data.hasMonthlyPlan !== false ||
      busy
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
    } catch {
      setError("Store purchase is unavailable. Please try again later.");
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
        At least 10 credits are needed to start. Native top-ups are not
        available yet.
      </Text>
      {data?.nativeSubscriptionsEnabled &&
      data.hasMonthlyPlan === false &&
      key &&
      productId ? (
        <Action
          label="View subscription"
          onPress={() => void purchase()}
          disabled={busy}
        />
      ) : (
        <Text className="text-muted-foreground">
          Store purchases are unavailable for this account.
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
    </View>
  );
}
