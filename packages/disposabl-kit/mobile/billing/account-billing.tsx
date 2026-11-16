import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { billingSession } from "./session";
import {
  monthlyOfferingId,
  presentMonthlyPaywall,
  selectMonthlyOffering,
} from "./paywall";
import { creditQuantity } from "../../payments/config";
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
      let result: Snapshot;
      try {
        result = await getSnapshot({});
      } catch {
        if (latest()) {
          setData(null);
          setRefreshError("Billing could not refresh. Please try again.");
        }
        return;
      }
      if (!latest()) return;
      setData(result);
      try {
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
          setMonthly(null);
          setRefreshError("Store unavailable. Please try again.");
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

  const disabled = busy || web.busy || topup.busy;
  const openManagement = (url: string) => {
    void Linking.openURL(url).catch(() =>
      setMessage("Could not open subscription settings."),
    );
  };

  return (
    <View className="gap-4">
      <View>
        <Text className="text-[13px] font-medium text-muted-foreground">
          Available
        </Text>
        <Text className="text-[28px] font-bold tracking-[-0.5px] text-foreground">
          {data?.balance == null
            ? "Unavailable"
            : `${new Intl.NumberFormat().format(data.balance)} credits`}
        </Text>
      </View>
      {data?.hasMonthlyPlan && (
        <Text className="text-[14px] text-muted-foreground">
          Monthly plan active or scheduled.
        </Text>
      )}
      {data?.monthlyCheckoutPending && (
        <Text className="text-[14px] text-muted-foreground">
          Finish or cancel your website checkout first.
        </Text>
      )}
      {monthly ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              disabled ||
              data?.hasMonthlyPlan !== false ||
              data?.monthlyCheckoutPending !== false,
          }}
          disabled={
            disabled ||
            data?.hasMonthlyPlan !== false ||
            data?.monthlyCheckoutPending !== false
          }
          onPress={() => void transact(false)}
          className={`rounded-[14px] bg-foreground p-4 active:opacity-60 ${disabled || data?.hasMonthlyPlan !== false || data?.monthlyCheckoutPending !== false ? "opacity-60" : ""}`}
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-[16px] font-semibold text-background">
              {creditQuantity("monthly")} credits / month
            </Text>
            <Text className="text-[16px] font-semibold text-background">
              {monthly.product.priceString} / mo
            </Text>
          </View>
          <Text className="mt-1 text-[13px] text-background opacity-70">
            Unused credits expire monthly
          </Text>
        </Pressable>
      ) : (
        <Text className="text-[14px] text-muted-foreground">
          Store subscriptions unavailable.
        </Text>
      )}
      {topup.product && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void topup.purchase()}
          className={`rounded-[14px] border border-border px-4 py-3 active:opacity-60 ${disabled ? "opacity-60" : ""}`}
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-[16px] font-semibold text-foreground">
              {creditQuantity("topup")} credits once
            </Text>
            <Text className="text-[16px] font-semibold text-foreground">
              {topup.product.priceString}
            </Text>
          </View>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Never expires
          </Text>
        </Pressable>
      )}
      <View className="flex-row flex-wrap gap-x-5 gap-y-2">
        {web.available && (
          <BillingLink
            title="Monthly on website"
            disabled={disabled}
            onPress={() => void web.open()}
          />
        )}
        {web.topupAvailable && (
          <BillingLink
            title="Top-up on website"
            disabled={disabled}
            onPress={() => void web.open("topup")}
          />
        )}
        <BillingLink
          title="Refresh"
          disabled={busy}
          onPress={() => void refresh(generation.current)}
        />
        {!!key && data?.nativeSubscriptionsEnabled && (
          <BillingLink
            title="Restore"
            disabled={busy}
            onPress={() => void transact(true)}
          />
        )}
      </View>
      <Text className="text-[13px] leading-[18px] text-muted-foreground">
        Manage or cancel where you subscribed:
      </Text>
      <View className="flex-row flex-wrap gap-x-5 gap-y-2">
        <BillingLink
          title="Apple"
          onPress={() =>
            openManagement("https://apps.apple.com/account/subscriptions")
          }
        />
        <BillingLink
          title="Google Play"
          onPress={() =>
            openManagement(
              "https://play.google.com/store/account/subscriptions",
            )
          }
        />
        <Text className="py-1 text-[13px] text-muted-foreground">
          Website: pricing page
        </Text>
      </View>
      {[topup.message, refreshError, message, web.error]
        .filter(Boolean)
        .map((text, index) => (
          <Text
            key={index}
            accessibilityRole="alert"
            className="text-[14px] leading-[20px] text-muted-foreground"
          >
            {text}
          </Text>
        ))}
    </View>
  );
}

function BillingLink({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`py-1 active:opacity-60 ${disabled ? "opacity-60" : ""}`}
    >
      <Text className="text-[14px] font-semibold text-primary-text">
        {title}
      </Text>
    </Pressable>
  );
}
