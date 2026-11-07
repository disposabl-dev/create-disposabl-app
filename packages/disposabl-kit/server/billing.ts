export const billingPlans = {
  monthly: "credits_monthly",
  topup: "credits_topup",
} as const;
export type Purchase = keyof typeof billingPlans;

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

export async function billingRequest(
  key: string,
  method: string,
  body: object,
  fetcher = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(`https://api.useautumn.com/v1/${method}`, {
    method: "POST",
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

export function purchaseRequest(
  customerId: string,
  purchase: Purchase,
  returnUrl: string,
) {
  if (!Object.hasOwn(billingPlans, purchase))
    throw new Error("Invalid purchase.");
  return {
    customer_id: customerId,
    plan_id: billingPlans[purchase],
    ...(purchase === "topup"
      ? {
          feature_quantities: [
            { feature_id: "credits", quantity: 500, adjustable: false },
          ],
        }
      : {}),
    redirect_mode: "always",
    success_url: returnUrl,
  };
}

export function balanceFromCustomer(
  customer: Record<string, unknown>,
): number | null {
  const balances = customer.balances as
    Record<string, { remaining?: unknown }> | undefined;
  const remaining = balances?.credits?.remaining;
  return typeof remaining === "number" && Number.isFinite(remaining)
    ? remaining
    : null;
}

/** Missing or unfamiliar provider data must not authorize another subscription. */
export function monthlyPlanFromCustomer(
  customer: Record<string, unknown>,
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
    if (subscription.plan_id === billingPlans.monthly) present = true;
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
