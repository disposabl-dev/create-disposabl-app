import { createFileRoute } from "@tanstack/react-router";
import { makeFunctionReference } from "convex/server";
import { useAction, useConvexAuth } from "convex/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { sessionId } from "../../lib/auth-session";
import { paymentsEnabled } from "../../features";
import {
  requestCheckout,
  handoffSelection,
  handoffAllows,
  type CheckoutResult,
} from "../../payments/checkout-attempt";
import {
  pricing,
  creditQuantity,
  formatPrice,
  monthlyLabel,
} from "../../payments/config";

export const Route = createFileRoute("/_providers/pricing")({
  component: () => (
    <main>
      <Pricing />
    </main>
  ),
});
const snapshot = makeFunctionReference<
  "action",
  Record<string, never>,
  {
    balance: number | null;
    hasMonthlyPlan: boolean | null;
    checkoutNeedsReview: boolean;
    customerId: string;
  }
>("billing:snapshot");
const checkout = makeFunctionReference<
  "action",
  { purchase: "monthly" | "topup"; requestId: string },
  CheckoutResult
>("billing:checkout");
const portal = makeFunctionReference<
  "action",
  Record<string, never>,
  { url: string }
>("billing:portal");

export function Pricing() {
  if (!paymentsEnabled)
    return (
      <section className="mx-auto max-w-5xl p-8">
        <h1>Payments are unavailable</h1>
        <SubscriptionHelp />
      </section>
    );
  return <SessionPricing />;
}
function SessionPricing() {
  const token = useAuthToken();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const session = !isLoading && isAuthenticated ? sessionId(token) : null;
  return <PurchasePage key={session ?? "signed-out"} session={session} />;
}
function SubscriptionHelp() {
  return (
    <p>
      Manage or cancel with the provider you originally paid. For mobile
      purchases, open{" "}
      <a
        className="underline"
        href="https://apps.apple.com/account/subscriptions"
      >
        Apple subscriptions
      </a>
      {" or "}
      <a
        className="underline"
        href="https://play.google.com/store/account/subscriptions"
      >
        Google Play subscriptions
      </a>
      . For website purchases, use the billing link in your receipt, or sign in
      and choose Manage website billing when available.
    </p>
  );
}
function PurchasePage({ session }: { session: string | null }) {
  const [handoff] = useState(() =>
    typeof window === "undefined"
      ? null
      : handoffSelection(window.sessionStorage.getItem("billing-from-ios")),
  );
  const [fromIos] = useState(
    () =>
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).get("source") === "ios" ||
        !!handoff),
  );
  const { isLoading } = useConvexAuth();
  const getSnapshot = useAction(snapshot);
  const start = useAction(checkout);
  const openPortal = useAction(portal);
  const [balance, setBalance] = useState<number | null>(null);
  const [hasMonthlyPlan, setHasMonthlyPlan] = useState<boolean | null>(null);
  const [checkoutNeedsReview, setCheckoutNeedsReview] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  useLayoutEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!session) return;
    const sequence = ++refreshSequence.current;
    const version = generation.current;
    try {
      const result = await getSnapshot({});
      if (
        version !== generation.current ||
        sequence !== refreshSequence.current
      )
        return;
      setBalance(result.balance);
      setHasMonthlyPlan(result.hasMonthlyPlan);
      setCheckoutNeedsReview(result.checkoutNeedsReview);
      setCustomerId(result.customerId);
      setRefreshError("");
    } catch {
      if (
        version !== generation.current ||
        sequence !== refreshSequence.current
      )
        return;
      setHasMonthlyPlan(null);
      setRefreshError("Balance is unavailable. Please try again.");
    }
  }, [getSnapshot, session]);
  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);
  async function purchase(kind: "monthly" | "topup") {
    if (
      !session ||
      !customerId ||
      busy ||
      !handoffAllows(fromIos, handoff, customerId, kind)
    )
      return;
    const version = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await requestCheckout(
        localStorage,
        customerId,
        kind,
        start,
      );
      if (version !== generation.current) return;
      if (result.retryAllowed) {
        setMessage(
          "Your previous checkout is closed. Choose Buy again to start a new checkout.",
        );
        await refresh();
      } else if (result.url) window.location.assign(result.url);
      else {
        setMessage(
          "Your purchase is being processed. Refresh the balance to check for confirmation.",
        );
        await refresh();
      }
    } catch {
      if (version === generation.current)
        setMessage(
          "Checkout status could not be confirmed. Refresh and contact support before retrying if it needs review.",
        );
      await refresh();
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function manage() {
    if (!session || busy) return;
    const version = generation.current;
    setBusy(true);
    try {
      const result = await openPortal({});
      if (version === generation.current) window.location.assign(result.url);
    } catch {
      if (version !== generation.current) return;
      setMessage("Unable to open billing settings. Please try again.");
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Pricing</h1>
      </div>
      {isLoading ? (
        <p>Checking your account...</p>
      ) : !session ? (
        <p>
          <a href="/login" className="underline">
            Sign in
          </a>{" "}
          to purchase credits.
        </p>
      ) : (
        <>
          <p>
            Available credits:{" "}
            {balance === null ? "not yet available" : balance}{" "}
            <button className="underline" onClick={() => void refresh()}>
              Refresh
            </button>
          </p>
          <p>
            After checkout, credits appear when payment is confirmed. Refresh if
            the balance has not updated yet.
          </p>
          {fromIos && (
            <p>After checkout, return to the app and refresh your credits.</p>
          )}
          {checkoutNeedsReview && (
            <p role="alert">
              A previous checkout needs review. Contact support before retrying
              that purchase.
            </p>
          )}
          <button
            className="underline"
            disabled={busy}
            onClick={() => void manage()}
          >
            Manage website billing
          </button>
        </>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {(!fromIos || handoff?.purchase === "monthly") && (
          <section className="rounded-lg border p-6">
            <h2 className="text-xl font-semibold">{monthlyLabel()}</h2>
            <p>{formatPrice(pricing.monthly.price)} / month</p>
            <p>
              {creditQuantity("monthly")} credits each month. Unused monthly
              credits expire.
            </p>
            <button
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={
                !session ||
                !customerId ||
                busy ||
                hasMonthlyPlan !== false ||
                !handoffAllows(fromIos, handoff, customerId, "monthly")
              }
              onClick={() => void purchase("monthly")}
            >
              {hasMonthlyPlan
                ? "Monthly plan active or scheduled"
                : "Choose monthly"}
            </button>
          </section>
        )}
        {handoffAllows(fromIos, handoff, customerId, "topup") && (
          <section className="rounded-lg border p-6">
            <h2 className="text-xl font-semibold">Top-up</h2>
            <p>{formatPrice(pricing.topup.price)} once</p>
            <p>{creditQuantity("topup")} credits that do not expire.</p>
            <button
              className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={!session || !customerId || busy}
              onClick={() => void purchase("topup")}
            >
              Buy top-up
            </button>
          </section>
        )}
      </div>
      <SubscriptionHelp />
      {refreshError && <p role="status">{refreshError}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
