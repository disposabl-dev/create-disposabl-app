import { pricing } from "../payments/config";

export type RevenueCatConfig = {
  authorization: string;
  project: string;
  app: string;
  environment: "SANDBOX" | "PRODUCTION";
  product: string;
  store: "APP_STORE" | "PLAY_STORE";
  autumnKey: string;
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
  type: "purchase" | "cancel" | "review";
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
    e.type !== "TRANSFER" ||
    e.app_id !== config.app ||
    (e.environment !== undefined && e.environment !== config.environment) ||
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

/** Explicit opt-in means a managed integration must not own this product. */
export function revenueCatConfig(
  enabled: boolean,
  env: Record<string, string | undefined>,
): RevenueCatConfig | null {
  if (!enabled || env.REVENUECAT_CONSUMABLE_OWNER !== "custom") return null;
  const authorization = env.REVENUECAT_WEBHOOK_AUTH?.trim();
  const project = env.REVENUECAT_PROJECT_ID?.trim();
  const app = env.REVENUECAT_APP_ID?.trim();
  const product = env.REVENUECAT_TOPUP_PRODUCT_ID?.trim();
  const autumnKey = env.AUTUMN_SECRET_KEY?.trim();
  const environment = env.REVENUECAT_ENVIRONMENT;
  const store = env.REVENUECAT_STORE;
  if (
    !authorization ||
    !project ||
    !app ||
    !product ||
    !autumnKey ||
    (environment !== "SANDBOX" && environment !== "PRODUCTION") ||
    (store !== "APP_STORE" && store !== "PLAY_STORE")
  )
    return null;
  return {
    authorization,
    project,
    app,
    environment,
    product,
    store,
    autumnKey,
  };
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
    (e.original_app_user_id !== undefined &&
      e.original_app_user_id !== customer)
  )
    return null;
  const type =
    e.type === "NON_RENEWING_PURCHASE"
      ? "purchase"
      : e.type === "CANCELLATION"
        ? "cancel"
        : "review";
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
) {
  return {
    customer_id: customer,
    feature_id: pricing.featureId,
    balance_id: balance,
    ...(kind === "grant" ? { included_grant: 500 } : { remaining: 0 }),
  };
}
