import { creditQuantity, pricing } from "../payments/config";
import { billingKey } from "./billing";

export type RevenueCatConfig = {
  authorization: string;
  project: string;
  app: string;
  environment: "SANDBOX" | "PRODUCTION";
  product: string;
  store: "APP_STORE" | "PLAY_STORE";
  autumnKey: string;
  managedMonthlyProducts?: string[];
  reviewerCustomers?: string[];
  reviewerMonthly?: boolean;
};

export type PurchaseEvent = {
  deliveryId: string;
  project: string;
  app: string;
  environment: string;
  store: string;
  product: string;
  customer: string;
  transaction: string;
  type: "purchase" | "cancel" | "review" | "ignore";
  expiresAt?: number;
};

export function parseTransfer(payload: unknown, config: RevenueCatConfig) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const envelope = payload as Record<string, unknown>;
  if (
    envelope.api_version !== "1.0" ||
    !envelope.event ||
    typeof envelope.event !== "object" ||
    Array.isArray(envelope.event)
  )
    return null;
  const e = envelope.event as Record<string, unknown>;
  const ids = (x: unknown): x is string[] =>
    Array.isArray(x) &&
    x.length > 0 &&
    x.length <= 20 &&
    x.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 256,
    );
  if (
    config.reviewerCustomers !== undefined ||
    e.type !== "TRANSFER" ||
    e.app_id !== config.app ||
    e.environment !== config.environment ||
    (e.store !== undefined && e.store !== config.store) ||
    (e.project_id !== undefined && e.project_id !== config.project) ||
    typeof e.id !== "string" ||
    !e.id ||
    e.id.length > 256 ||
    !ids(e.transferred_from) ||
    !ids(e.transferred_to)
  )
    return null;
  return {
    project: config.project,
    app: config.app,
    environment: config.environment,
    deliveryId: e.id,
    from: e.transferred_from,
    to: e.transferred_to,
  };
}

/** One authenticated project/environment may route only explicitly listed apps. */
export function revenueCatConfigs(
  enabled: boolean,
  env: Record<string, string | undefined>,
): RevenueCatConfig[] | null {
  if (!enabled || env.REVENUECAT_CONSUMABLE_OWNER !== "custom") return null;
  const authorization = env.REVENUECAT_WEBHOOK_AUTH?.trim();
  const project = env.REVENUECAT_PROJECT_ID?.trim();
  const autumnKey = billingKey(env);
  const environment = env.REVENUECAT_ENVIRONMENT;
  if (
    !authorization ||
    !project ||
    !autumnKey ||
    (environment !== "SANDBOX" && environment !== "PRODUCTION") ||
    !autumnKey.startsWith(
      environment === "SANDBOX" ? "am_sk_test_" : "am_sk_live_",
    ) ||
    autumnKey.length <= "am_sk_test_".length ||
    autumnKey.length > 4096 ||
    /\s/.test(autumnKey)
  )
    return null;
  let routes: unknown;
  try {
    routes = JSON.parse(env.REVENUECAT_ROUTES ?? "");
  } catch {
    return null;
  }
  if (!Array.isArray(routes) || routes.length === 0 || routes.length > 20)
    return null;
  const result: RevenueCatConfig[] = [];
  for (const route of routes) {
    if (
      !route ||
      typeof route !== "object" ||
      Array.isArray(route) ||
      Object.keys(route).sort().join(",") !== "app,product,store" ||
      typeof route.app !== "string" ||
      !route.app ||
      route.app.trim() !== route.app ||
      route.app.length > 256 ||
      typeof route.product !== "string" ||
      !route.product ||
      route.product.trim() !== route.product ||
      route.product.length > 256 ||
      (route.store !== "APP_STORE" && route.store !== "PLAY_STORE") ||
      result.some((item) => item.app === route.app)
    )
      return null;
    result.push({ authorization, project, environment, autumnKey, ...route });
  }
  if (env.REVENUECAT_MANAGED_MONTHLY_ROUTES !== undefined) {
    let monthly: unknown;
    try {
      monthly = JSON.parse(env.REVENUECAT_MANAGED_MONTHLY_ROUTES);
    } catch {
      return null;
    }
    if (!Array.isArray(monthly) || monthly.length > 20) return null;
    for (const route of monthly) {
      if (
        !route ||
        typeof route !== "object" ||
        Array.isArray(route) ||
        Object.keys(route).sort().join(",") !== "app,product,store" ||
        typeof route.product !== "string" ||
        !route.product ||
        route.product.trim() !== route.product ||
        route.product.length > 256
      )
        return null;
      const config = result.find(
        (item) => item.app === route.app && item.store === route.store,
      );
      if (
        !config ||
        config.product === route.product ||
        config.managedMonthlyProducts?.includes(route.product)
      )
        return null;
      (config.managedMonthlyProducts ??= []).push(route.product);
    }
  }
  if (environment === "PRODUCTION" && env.REVENUECAT_REVIEWER_USERS) {
    let users: unknown;
    try {
      users = JSON.parse(env.REVENUECAT_REVIEWER_USERS);
    } catch {
      return null;
    }
    if (
      !Array.isArray(users) ||
      !users.length ||
      users.length > 20 ||
      !users.every(
        (id) => typeof id === "string" && /^[a-z0-9]{20,64}$/.test(id),
      ) ||
      new Set(users).size !== users.length
    )
      return null;
    const reviewers = users as string[];
    const sandbox = result.flatMap((route) => [
      {
        ...route,
        environment: "SANDBOX" as const,
        managedMonthlyProducts: undefined,
        reviewerCustomers: reviewers,
      },
      ...(route.managedMonthlyProducts ?? []).map((product) => ({
        ...route,
        product,
        environment: "SANDBOX" as const,
        managedMonthlyProducts: undefined,
        reviewerCustomers: reviewers,
        reviewerMonthly: true,
      })),
    ]);
    result.push(...sandbox);
  }
  return result;
}

/** Managed monthly lifecycle events are acknowledged without entering the top-up inbox. */
export function isManagedMonthlyEvent(
  payload: unknown,
  configs: RevenueCatConfig[],
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const event = (payload as Record<string, unknown>).event;
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const e = event as Record<string, unknown>;
  if (
    !["INITIAL_PURCHASE", "RENEWAL", "CANCELLATION"].includes(e.type as string)
  )
    return false;
  return configs.some((config) =>
    config.managedMonthlyProducts?.some(
      (product) =>
        parseRevenueCatEvent(payload, { ...config, product }) !== null,
    ),
  );
}

export function selectRevenueCatRoute(
  payload: unknown,
  configs: RevenueCatConfig[],
) {
  const matches = configs.filter(
    (config) =>
      parseTransfer(payload, config) || parseRevenueCatEvent(payload, config),
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function resolveRevenueCatRoute(
  identity: Pick<
    PurchaseEvent,
    "project" | "app" | "environment" | "store" | "product"
  >,
  configs: RevenueCatConfig[],
) {
  const matches = configs.filter(
    (config) =>
      config.project === identity.project &&
      config.app === identity.app &&
      config.environment === identity.environment &&
      config.store === identity.store &&
      config.product === identity.product,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function parseRevenueCatEvent(
  payload: unknown,
  config: RevenueCatConfig,
): PurchaseEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const envelope = payload as Record<string, unknown>;
  if (
    envelope.api_version !== "1.0" ||
    !envelope.event ||
    typeof envelope.event !== "object" ||
    Array.isArray(envelope.event)
  )
    return null;
  const e = envelope.event as Record<string, unknown>;
  const valid = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value;
  if (
    ![e.id, e.app_user_id, e.transaction_id].every(valid) ||
    e.app_id !== config.app ||
    e.environment !== config.environment ||
    e.store !== config.store ||
    e.product_id !== config.product ||
    (e.project_id !== undefined && e.project_id !== config.project)
  )
    return null;
  const customer = e.app_user_id as string;
  if (
    customer.startsWith("$RCAnonymousID:") ||
    (config.reviewerCustomers &&
      !config.reviewerCustomers.includes(customer)) ||
    (e.original_app_user_id !== undefined &&
      e.original_app_user_id !== customer)
  )
    return null;
  let type: PurchaseEvent["type"];
  let expiresAt: number | undefined;
  if (config.reviewerMonthly) {
    if (e.type === "INITIAL_PURCHASE" || e.type === "RENEWAL") {
      if (
        !Number.isSafeInteger(e.expiration_at_ms) ||
        (e.expiration_at_ms as number) <= 0
      )
        return null;
      expiresAt = e.expiration_at_ms as number;
      type = "purchase";
    } else if (
      e.type === "CANCELLATION" &&
      e.cancel_reason === "CUSTOMER_SUPPORT"
    )
      type = "cancel";
    else if (
      (e.type === "CANCELLATION" &&
        [
          "UNSUBSCRIBE",
          "BILLING_ERROR",
          "DEVELOPER_INITIATED",
          "PRICE_INCREASE",
        ].includes(e.cancel_reason as string)) ||
      e.type === "EXPIRATION"
    )
      type = "ignore";
    else type = "review";
  } else {
    type =
      e.type === "NON_RENEWING_PURCHASE"
        ? "purchase"
        : e.type === "CANCELLATION"
          ? "cancel"
          : "review";
  }
  return {
    deliveryId: e.id as string,
    project: config.project,
    app: config.app,
    environment: config.environment,
    store: config.store,
    product: config.product,
    customer,
    transaction: e.transaction_id as string,
    type,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

export async function balanceId(
  event: Pick<
    PurchaseEvent,
    "project" | "app" | "environment" | "store" | "transaction"
  >,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      "revenuecat",
      event.project,
      event.app,
      event.environment,
      event.store,
      event.transaction,
    ]),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `rc_${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function balanceRequest(
  customer: string,
  balance: string,
  kind: "grant" | "refund",
  expiresAt?: number,
) {
  return {
    customer_id: customer,
    feature_id: pricing.featureId,
    balance_id: balance,
    ...(kind === "grant"
      ? {
          included_grant: creditQuantity(
            expiresAt === undefined ? "topup" : "monthly",
          ),
          ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
        }
      : { remaining: 0 }),
  };
}
