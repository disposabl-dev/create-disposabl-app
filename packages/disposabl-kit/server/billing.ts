import { pricing, creditQuantity, type Pricing } from "../payments/config";

export type { Purchase } from "../payments/config";

export function billingConfig(
  enabled: boolean,
  env: Record<string, string | undefined>,
) {
  if (!enabled) return null;
  const key = env.AUTUMN_SECRET_KEY?.trim();
  const returnUrl = env.BILLING_RETURN_URL?.trim();
  if (!key || !returnUrl) throw new Error("Payments are not configured.");
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    throw new Error("Payments are not configured.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Payments are not configured.");
  return { key, returnUrl: url.toString() };
}

export function mobileWebCheckoutConfigured(
  enabled: boolean,
  env: Record<string, string | undefined>,
) {
  if (
    !enabled ||
    env.MOBILE_WEB_CHECKOUT_ENABLED !== "true" ||
    env.REVENUECAT_SYNC_ENABLED !== "true"
  )
    return false;
  try {
    const config = billingConfig(true, env)!;
    const url = new URL(config.returnUrl);
    return url.protocol === "https:" && url.pathname === "/pricing";
  } catch {
    return false;
  }
}

export async function billingRequest(
  key: string,
  method: string,
  body: object,
  fetcher = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(`https://api.useautumn.com/v1/${method}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "x-api-version": "2.6.0",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Billing is temporarily unavailable.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Billing is temporarily unavailable.");
  return result as Record<string, unknown>;
}

export function checkoutUrl(result: Record<string, unknown>): string | null {
  if (typeof result.payment_url !== "string") return null;
  try {
    const url = new URL(result.payment_url);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function purchaseRequest(
  customerId: string,
  purchase: string,
  returnUrl: string,
  config: Pricing = pricing,
) {
  if (purchase !== "monthly" && purchase !== "topup")
    throw new Error("Invalid purchase.");
  return {
    customer_id: customerId,
    plan_id: config[purchase].planId,
    ...(purchase === "topup"
      ? {
          feature_quantities: [
            {
              feature_id: config.featureId,
              quantity: creditQuantity(purchase, config),
              adjustable: false,
            },
          ],
        }
      : {}),
    redirect_mode: "always",
    success_url: returnUrl,
  };
}

export function balanceFromCustomer(
  customer: Record<string, unknown>,
  config: Pricing = pricing,
): number | null {
  const balances = customer.balances as
    Record<string, { remaining?: unknown }> | undefined;
  const remaining = balances?.[config.featureId]?.remaining;
  return typeof remaining === "number" && Number.isFinite(remaining)
    ? remaining
    : null;
}

/** Missing or unfamiliar provider data must not authorize another subscription. */
export function monthlyPlanFromCustomer(
  customer: Record<string, unknown>,
  config: Pricing = pricing,
): boolean | null {
  if (!Array.isArray(customer.subscriptions)) return null;
  let present = false;
  for (const subscription of customer.subscriptions) {
    if (
      !subscription ||
      typeof subscription.plan_id !== "string" ||
      !["active", "scheduled"].includes(subscription.status)
    )
      return null;
    if (subscription.plan_id === config.monthly.planId) present = true;
  }
  return present;
}

export async function billingContext(
  enabled: boolean,
  env: Record<string, string | undefined>,
  getUserId: () => Promise<string | null>,
) {
  if (!enabled) throw new Error("Payments are disabled.");
  const userId = await getUserId();
  if (!userId) throw new Error("Please sign in to use payments.");
  const config = billingConfig(true, env)!;
  return { ...config, userId };
}
