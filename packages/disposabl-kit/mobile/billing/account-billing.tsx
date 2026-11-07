import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { AuthButton, styles } from "../components/auth-ui";
import { billingSession } from "./session";

type Snapshot = {
  balance: number | null;
  hasMonthlyPlan: boolean | null;
  nativeSubscriptionsEnabled: boolean;
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
      try {
        const result = await getSnapshot({});
        if (!latest()) return;
        setData(result);
        if (key && productId && result.nativeSubscriptionsEnabled) {
          const offerings = await billingSession.run(
            customerId,
            version,
            key,
            (sdk) => sdk.getOfferings(),
          );
          if (latest())
            setMonthly(
              offerings.current?.availablePackages.find(
                (entry) =>
                  entry.product.identifier === productId &&
                  entry.product.subscriptionPeriod === "P1M",
              ) ?? null,
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
    const version = billingSession.select(customerId);
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

  async function transact(restore: boolean) {
    if (operation.current || !key) return;
    operation.current = true;
    const version = generation.current;
    setBusy(true);
    setMessage("");
    let completed = false;
    try {
      await billingSession.run(customerId, version, key, async (sdk) => {
        const latest = await getSnapshot({});
        if (!current(version)) throw new Error("Account changed.");
        if (!latest.nativeSubscriptionsEnabled)
          throw new Error("Not configured.");
        if (restore) return sdk.restorePurchases();
        const info = await sdk.getCustomerInfo();
        if (!current(version)) throw new Error("Account changed.");
        if (
          latest.hasMonthlyPlan !== false ||
          info.activeSubscriptions.length
        ) {
          throw new Error("existing_subscription");
        }
        if (!monthly) throw new Error("Product unavailable.");
        return sdk.purchasePackage(monthly);
      });
      completed = true;
    } catch (error) {
      if (current(version))
        setMessage(
          (error as { userCancelled?: boolean })?.userCancelled
            ? "Purchase cancelled."
            : error instanceof Error &&
                error.message === "existing_subscription"
              ? "You already have a subscription. Manage it where you purchased it."
              : "Could not complete the store request. Refresh before trying again.",
        );
    } finally {
      operation.current = false;
      if (current(version)) setBusy(false);
    }
    if (completed && current(version)) {
      const confirmation = restore
        ? "Restore check completed. Any eligible purchases will sync to your account."
        : "Purchase received. Credits appear after payment sync.";
      setMessage(confirmation);
      await refresh(version);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Credits</Text>
      <Text style={styles.body}>
        Available: {data?.balance ?? "unavailable"}
      </Text>
      <Text style={styles.body}>500 credits each monthly billing cycle.</Text>
      {data?.hasMonthlyPlan && (
        <Text style={styles.body}>
          Your monthly plan is active or scheduled.
        </Text>
      )}
      {monthly ? (
        <AuthButton
          title={`${monthly.product.priceString} / month`}
          disabled={busy || data?.hasMonthlyPlan !== false}
          onPress={() => void transact(false)}
        />
      ) : (
        <Text style={styles.body}>Store subscriptions are unavailable.</Text>
      )}
      <Text style={styles.body}>
        Native top-ups are not available yet. Existing credits work here.
      </Text>
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
      <Text style={styles.body}>
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
      {!!refreshError && <Text style={styles.body}>{refreshError}</Text>}
      {!!message && (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      )}
    </View>
  );
}
