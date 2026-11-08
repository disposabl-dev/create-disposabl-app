import { revenueCatConfigs } from "./revenuecat-contract";

/** Expose only non-secret routing metadata after an operator verifies the integration. */
export function nativeTopupRoutes(
  enabled: boolean,
  env: Record<string, string | undefined>,
) {
  if (env.REVENUECAT_CONSUMABLE_INTEGRATION_VERIFIED !== "true") return [];
  return (revenueCatConfigs(enabled, env) ?? []).map(
    ({ app, store, product }) => ({ app, store, product }),
  );
}
