import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { AuthButton, authClasses } from "../components/auth-ui";
import { billingSession } from "./session";
import {
  monthlyOfferingId,
  presentMonthlyPaywall,
  selectMonthlyOffering,
} from "./paywall";
import { creditQuantity, monthlyLabel } from "../../payments/config";
import { paymentOptions, storeEligibility } from "./policy";
import { useWebCheckout } from "./web-checkout";
import { useTopup } from "./use-topup";
import type { TopupRoute } from "./topup";

type Snapshot = {
  balance: number | null;
  hasMonthlyPlan: boolean | null;
  monthlyCheckoutPending: boolean;
  nativeSubscriptionsEnabled: boolean;
  nativeTopupRoutes: TopupRoute[];
  mobileWebCheckoutEnabled: boolean;
  customerId: string;
};
const snapshot = makeFunctionReference<
  "action",
  Record<string, never>,
  Snapshot
>("billing:snapshot");
const key =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : Platform.OS === "android"
      ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
      : undefined;
const productId =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT;

/** Render only for an authenticated customer when payments is selected. */
export function AccountBilling({ customerId }: { customerId: string }) {
  const getSnapshot = useAction(snapshot);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const operation = useRef(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const current = useCallback(
    (version: number) => billingSession.current(customerId, version),
    [customerId],
  );

  const refresh = useCallback(
    async (version: number) => {
      const sequence = ++refreshSequence.current;
      const latest = () =>
        current(version) && sequence === refreshSequence.current;
      if (latest()) setMonthly(null);
      try {
        const result = await getSnapshot({});
        if (!latest()) return;
        setData(result);
        if (key && productId && result.nativeSubscriptionsEnabled) {
          const store = await billingSession.run(
            customerId,
            version,
            key,
            async (sdk) => ({
              eligibility: await storeEligibility(sdk, Platform.OS),
              offerings: await sdk.getOfferings(),
            }),
          );
          const options = paymentOptions({
            platform: Platform.OS,
            ...store.eligibility,
            paymentsEnabled: true,
            nativeReady: result.nativeSubscriptionsEnabled,
            webCheckoutEnabled: result.mobileWebCheckoutEnabled,
          });
          const offering = selectMonthlyOffering(
            store.offerings,
            productId,
            monthlyOfferingId,
          );
          if (latest())
            setMonthly(
              options.native ? (offering?.availablePackages[0] ?? null) : null,
            );
        } else setMonthly(null);
        if (latest()) setRefreshError("");
      } catch {
        if (latest()) {
          setData(null);
          setRefreshError("Billing could not refresh. Please try again.");
        }
      }
    },
    [customerId, current, getSnapshot],
  );

  useEffect(() => {
    const version = billingSession.acquire(customerId);
    generation.current = version;
    const update = () => void refresh(version);
    update();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      listener.remove();
      billingSession.release(customerId, version);
    };
  }, [customerId, current, refresh]);

  const webSnapshot = useCallback(() => getSnapshot({}), [getSnapshot]);
  const web = useWebCheckout(
    customerId,
    generation,
    key,
    productId,
    webSnapshot,
  );

  const refreshBalance = useCallback(
    () => refresh(generation.current),
    [refresh],
  );
  const topup = useTopup(
    customerId,
    generation,
    key,
    webSnapshot,
    refreshBalance,
  );

  async function transact(restore: boolean) {
    if (
      operation.current ||
      topup.busy ||
      !key ||
      !billingSession.beginTransaction()
    )
      return;
    operation.current = true;
    const version = generation.current;
    setBusy(true);
    setMessage("");
    let completed: "purchased" | "restored" | null = null;
    try {
      const outcome = await billingSession.run(
        customerId,
        version,
        key,
        async (sdk) => {
          if (restore) {
            const latest = await getSnapshot({});
            if (!current(version)) throw new Error("Account changed.");
            if (!latest.nativeSubscriptionsEnabled)
              throw new Error("Not configured.");
            await sdk.restorePurchases();
            return "restored" as const;
          }
          if (!monthly || !productId) throw new Error("Product unavailable.");
          return presentMonthlyPaywall(
            sdk,
            () => getSnapshot({}),
            () => current(version),
            productId,
            undefined,
            monthlyOfferingId,
          );
        },
      );
      completed = outcome === "cancelled" ? null : outcome;
      if (outcome === "cancelled" && current(version))
        setMessage("Purchase cancelled.");
    } catch (error) {
      if (current(version))
        setMessage(
          (error as { userCancelled?: boolean })?.userCancelled
            ? "Purchase cancelled."
            : error instanceof Error &&
                error.message ===
                  "Finish or cancel your website checkout before subscribing here."
              ? error.message
              : error instanceof Error &&
                  error.message === "existing_subscription"
                ? "You already have a subscription. Manage it where you purchased it."
                : "Could not complete the store request. Refresh before trying again.",
        );
    } finally {
      operation.current = false;
      billingSession.endTransaction();
      if (current(version)) setBusy(false);
    }
    if (completed && current(version)) {
      const confirmation =
        completed === "restored"
          ? "Restore check completed. Any eligible purchases will sync to your account."
          : "Purchase received. Credits appear after payment sync.";
      setMessage(confirmation);
      await refresh(version);
    }
  }

  return (
    <View className={authClasses.card}>
      <Text className={authClasses.title}>Credits</Text>
      <Text className={authClasses.body}>
        Available: {data?.balance ?? "unavailable"}
      </Text>
      <Text className={authClasses.body}>
        {monthlyLabel()}: {creditQuantity("monthly")} credits each billing
        cycle. Unused monthly credits expire.
      </Text>
      {data?.hasMonthlyPlan && (
        <Text className={authClasses.body}>
          Your monthly plan is active or scheduled.
        </Text>
      )}
      {data?.monthlyCheckoutPending && (
        <Text className={authClasses.body}>
          Finish or cancel your website checkout before subscribing here.
        </Text>
      )}
      {monthly ? (
        <AuthButton
          title={`${monthly.product.priceString} / month`}
          disabled={
            busy ||
            web.busy ||
            topup.busy ||
            data?.hasMonthlyPlan !== false ||
            data?.monthlyCheckoutPending !== false
          }
          onPress={() => void transact(false)}
        />
      ) : (
        <Text className={authClasses.body}>
          Store subscriptions are unavailable.
        </Text>
      )}
      {web.available && (
        <AuthButton
          title="Buy monthly on website"
          disabled={busy || web.busy || topup.busy}
          onPress={() => void web.open()}
        />
      )}
      {topup.product && (
        <AuthButton
          title={`Buy ${creditQuantity("topup")} credits · ${topup.product.priceString}`}
          disabled={busy || web.busy || topup.busy}
          onPress={() => void topup.purchase()}
        />
      )}
      {web.topupAvailable && (
        <AuthButton
          title="Buy top-up on website"
          disabled={busy || web.busy || topup.busy}
          onPress={() => void web.open("topup")}
        />
      )}
      {!!topup.message && (
        <Text accessibilityRole="alert" className={authClasses.body}>
          {topup.message}
        </Text>
      )}
      <AuthButton
        title="Refresh credits"
        disabled={busy}
        onPress={() => {
          void refresh(generation.current);
        }}
      />
      {!!key && data?.nativeSubscriptionsEnabled && (
        <AuthButton
          title="Restore purchases"
          disabled={busy}
          onPress={() => void transact(true)}
        />
      )}
      <Text className={authClasses.body}>
        Cancel or manage your subscription with the provider you originally
        paid. For a website purchase, use Manage website billing on the website
        pricing page.
      </Text>
      {[
        [
          "Manage Apple subscriptions",
          "https://apps.apple.com/account/subscriptions",
        ],
        [
          "Manage Google Play subscriptions",
          "https://play.google.com/store/account/subscriptions",
        ],
      ].map(([title, url]) => (
        <AuthButton
          key={title}
          title={title!}
          onPress={() => {
            void Linking.openURL(url!).catch(() =>
              setMessage("Could not open subscription settings."),
            );
          }}
        />
      ))}
      {!!refreshError && (
        <Text className={authClasses.body}>{refreshError}</Text>
      )}
      {!!message && (
        <Text accessibilityRole="alert" className={authClasses.body}>
          {message}
        </Text>
      )}
      {!!web.error && (
        <Text accessibilityRole="alert" className={authClasses.body}>
          {web.error}
        </Text>
      )}
    </View>
  );
}
