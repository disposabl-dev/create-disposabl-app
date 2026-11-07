import type { Auth } from "convex/server";
import { getSessionUserId, internalAction } from "./lib/functions";
import { v } from "convex/values";
import { action } from "../../backend/convex/_generated/server";
import { paymentsEnabled } from "../features";
import { setupBilling } from "./billing-setup";
import {
  balanceFromCustomer,
  monthlyPlanFromCustomer,
  billingContext,
  billingRequest,
  purchaseRequest,
} from "./billing";

export const setup = internalAction({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    created: v.array(v.string()),
    preserved: v.array(v.string()),
  }),
  handler: async () => setupBilling(paymentsEnabled, process.env),
});

async function context(ctx: { auth: Auth }) {
  return billingContext(paymentsEnabled, process.env, () =>
    getSessionUserId(ctx),
  );
}

export const snapshot = action({
  args: {},
  returns: v.object({
    balance: v.union(v.number(), v.null()),
    hasMonthlyPlan: v.union(v.boolean(), v.null()),
    nativeSubscriptionsEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    const { key, userId } = await context(ctx);
    try {
      const customer = await billingRequest(key, "customers.get_or_create", {
        customer_id: userId,
      });
      return {
        balance: balanceFromCustomer(customer),
        hasMonthlyPlan: monthlyPlanFromCustomer(customer),
        nativeSubscriptionsEnabled:
          process.env.REVENUECAT_SYNC_ENABLED === "true",
      };
    } catch {
      throw new Error("Billing is temporarily unavailable.");
    }
  },
});

export const checkout = action({
  args: { purchase: v.union(v.literal("monthly"), v.literal("topup")) },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx, { purchase }) => {
    const { key, userId, returnUrl } = await context(ctx);
    if (purchase === "monthly") {
      const customer = await billingRequest(key, "customers.get_or_create", {
        customer_id: userId,
      });
      const active = monthlyPlanFromCustomer(customer);
      if (active !== false)
        throw new Error(
          active
            ? "You already have a monthly plan. Manage it where you purchased it."
            : "Could not check your current plan. Please refresh and try again.",
        );
    }
    try {
      const result = await billingRequest(
        key,
        "billing.attach",
        purchaseRequest(userId, purchase, returnUrl),
      );
      return {
        url: typeof result.payment_url === "string" ? result.payment_url : null,
      };
    } catch {
      throw new Error("Unable to start checkout. Please try again.");
    }
  },
});

export const portal = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const { key, userId, returnUrl } = await context(ctx);
    try {
      const result = await billingRequest(key, "billing.open_customer_portal", {
        customer_id: userId,
        return_url: returnUrl,
      });
      if (typeof result.url !== "string") throw new Error();
      return { url: result.url };
    } catch {
      throw new Error("Unable to open billing settings. Please try again.");
    }
  },
});
