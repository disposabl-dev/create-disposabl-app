import { revenueCatConfigs } from "./revenuecat-contract";

type Environment = Record<string, string | undefined>;

/** Server-derived user IDs only; the route configuration validates the allowlist. */
export function reviewerNativeSubscriptionsEnabled(
  enabled: boolean,
  env: Environment,
  userId?: string,
) {
  return (
    !!userId &&
    (revenueCatConfigs(enabled, env) ?? []).some(
      (route) =>
        route.reviewerMonthly && route.reviewerCustomers?.includes(userId),
    )
  );
}

/** Expose non-secret consumable routes after verification or for a qualified test account. */
export function nativeTopupRoutes(
  enabled: boolean,
  env: Environment,
  userId?: string,
) {
  const configs = revenueCatConfigs(enabled, env) ?? [];
  const globallyVerified =
    env.REVENUECAT_CONSUMABLE_INTEGRATION_VERIFIED === "true";
  const eligible = reviewerNativeSubscriptionsEnabled(enabled, env, userId);
  return configs
    .filter(
      (route) =>
        !route.reviewerMonthly &&
        (globallyVerified
          ? !route.reviewerCustomers
          : eligible && route.reviewerCustomers?.includes(userId!)),
    )
    .map(({ app, store, product }) => ({ app, store, product }));
}
