import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import {
  balanceFromCustomer,
  billingRequest,
} from "@disposabl/disposabl-kit/server/billing";
import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

export async function requireCredits(
  userId: string,
  enabled = paymentsEnabled,
  key = env.AUTUMN_SECRET_KEY,
  request = billingRequest,
) {
  if (!enabled) return;
  let balance: number | null;
  try {
    if (!key?.trim()) throw new Error("Missing billing key");
    balance = balanceFromCustomer(
      await request(key.trim(), "customers.get_or_create", {
        customer_id: userId,
      }),
    );
  } catch {
    throw new ConvexError({
      code: "credits_unavailable",
      message: "Credits are temporarily unavailable. Please retry.",
    });
  }
  if (balance === null)
    throw new ConvexError({
      code: "credits_unavailable",
      message: "Credits are temporarily unavailable. Please retry.",
    });
  if (balance < 10)
    throw new ConvexError({
      code: "credits_required",
      balance,
      minimum: 10,
      paymentUrl: "https://www.disposabl.dev/pricing",
      message: "At least 10 credits are required to start work.",
    });
}
