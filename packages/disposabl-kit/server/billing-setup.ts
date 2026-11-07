import { creditQuantity, pricing, type Pricing } from "../payments/config";
import { billingRequest } from "./billing";

/** Create missing catalog entries only. Existing provider configuration is owner-managed. */
export async function setupBilling(
  enabled: boolean,
  env: Record<string, string | undefined>,
  config: Pricing = pricing,
  fetcher = fetch,
) {
  const result = {
    enabled,
    created: [] as string[],
    preserved: [] as string[],
  };
  if (!enabled) return result;
  const key = env.AUTUMN_SECRET_KEY?.trim();
  if (!key)
    throw new Error(
      "Payments setup requires AUTUMN_SECRET_KEY on this Convex deployment. Configure this app's Autumn connection and retry.",
    );
  if (
    !config.featureId.trim() ||
    !/^[A-Z]{3}$/i.test(config.currency) ||
    !Number.isFinite(config.creditsPerDollar) ||
    config.creditsPerDollar <= 0 ||
    config.monthly.planId === config.topup.planId ||
    (["monthly", "topup"] as const).some(
      (kind) =>
        !/^[a-zA-Z0-9_-]+$/.test(config[kind].planId) ||
        !Number.isFinite(config[kind].price) ||
        config[kind].price <= 0 ||
        !Number.isSafeInteger(creditQuantity(kind, config)) ||
        creditQuantity(kind, config) <= 0,
    )
  )
    throw new Error(
      "Payments setup requires valid prices, credits and IDs in payments/config.ts.",
    );

  const request = async (method: string, body: object) => {
    try {
      return await billingRequest(key, method, body, fetcher);
    } catch {
      // Do not expose provider responses or retry a potentially committed create.
      throw new Error(
        `Payments setup failed at ${method}. Check this deployment's Autumn key and provider catalog, then retry. Existing entries will be preserved.`,
      );
    }
  };
  const list = async (kind: "features" | "plans") => {
    // These API 2.6.0 endpoints return complete lists, not paginated results.
    // Never infer absence from an error response, including 404 or unauthorized.
    const response = await request(
      `${kind}.list`,
      kind === "plans" ? { include_archived: true, all_versions: true } : {},
    );
    if (
      !Array.isArray(response.list) ||
      response.list.some((entry) => !entry || typeof entry.id !== "string")
    )
      throw new Error(
        `Payments setup received an invalid ${kind} list; no entries created.`,
      );
    return new Set<string>(response.list.map((entry) => entry.id));
  };
  // Validate both reads before the first write. At most two reads and three creates.
  const features = await list("features");
  const plans = await list("plans");
  const ensure = async (
    kind: "features" | "plans",
    existing: Set<string>,
    id: string,
    body: object,
  ) => {
    const label = `${kind}:${id}`;
    if (existing.has(id)) {
      result.preserved.push(label);
      return;
    }
    const created = await request(`${kind}.create`, body);
    if (created.id !== id)
      throw new Error(
        `Payments setup could not confirm ${label}. Check Autumn and retry; existing entries will be preserved.`,
      );
    result.created.push(label);
  };
  await ensure("features", features, config.featureId, {
    feature_id: config.featureId,
    name: "Credits",
    type: "metered",
    consumable: true,
  });
  await ensure("plans", plans, config.monthly.planId, {
    plan_id: config.monthly.planId,
    name: "Monthly credits",
    auto_enable: false,
    price: { amount: config.monthly.price, interval: "month" },
    items: [
      {
        feature_id: config.featureId,
        included: creditQuantity("monthly", config),
        reset: { interval: "month" },
      },
    ],
  });
  await ensure("plans", plans, config.topup.planId, {
    plan_id: config.topup.planId,
    name: "Credits top-up",
    add_on: true,
    auto_enable: false,
    items: [
      {
        feature_id: config.featureId,
        price: {
          amount: config.topup.price,
          billing_units: creditQuantity("topup", config),
          interval: "one_off",
          billing_method: "prepaid",
        },
      },
    ],
  });
  return result;
}
