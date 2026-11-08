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
import { pricing, creditQuantity, formatPrice } from "../../payments/config";

export const Route = createFileRoute("/_providers/pricing")({
  component: Pricing,
});
const snapshot = makeFunctionReference<
  "action",
  Record<string, never>,
  { balance: number | null; hasMonthlyPlan: boolean | null }
>("billing:snapshot");
const checkout = makeFunctionReference<
  "action",
  { purchase: "monthly" | "topup" },
  { url: string | null }
>("billing:checkout");
const portal = makeFunctionReference<
  "action",
  Record<string, never>,
  { url: string }
>("billing:portal");

function Pricing() {
  if (!paymentsEnabled)
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h1>Payments are unavailable</h1>
        <SubscriptionHelp />
      </main>
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
  const { isLoading } = useConvexAuth();
  const getSnapshot = useAction(snapshot);
  const start = useAction(checkout);
  const openPortal = useAction(portal);
  const [balance, setBalance] = useState<number | null>(null);
  const [hasMonthlyPlan, setHasMonthlyPlan] = useState<boolean | null>(null);
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
    if (!session || busy) return;
    const version = generation.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await start({ purchase: kind });
      if (version !== generation.current) return;
      if (result.url) window.location.assign(result.url);
      else {
        setMessage(
          "Your purchase is being processed. Refresh the balance to check for confirmation.",
        );
        await refresh();
      }
    } catch {
      if (version === generation.current)
        setMessage("Unable to start checkout. Please try again.");
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
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p>
          {pricing.creditsPerDollar} credits per {formatPrice(1)}.
        </p>
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
        <section className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold">Monthly</h2>
          <p>{formatPrice(pricing.monthly.price)} / month</p>
          <p>{creditQuantity("monthly")} credits each billing cycle.</p>
          <button
            className="mt-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={!session || busy || hasMonthlyPlan !== false}
            onClick={() => void purchase("monthly")}
          >
            {hasMonthlyPlan
              ? "Monthly plan active or scheduled"
              : "Choose monthly"}
          </button>
        </section>
        <section className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold">Top-up</h2>
          <p>{formatPrice(pricing.topup.price)} once</p>
          <p>{creditQuantity("topup")} credits that do not expire.</p>
          <button
            className="mt-4 rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={!session || busy}
            onClick={() => void purchase("topup")}
          >
            Buy top-up
          </button>
        </section>
      </div>
      <SubscriptionHelp />
      {refreshError && <p role="status">{refreshError}</p>}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
