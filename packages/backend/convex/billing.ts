import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  createBeginAttempt,
  createCheckout,
  createSnapshot,
  type BillingEligibility,
} from "@disposabl/disposabl-kit/server/billing-functions";

export const requireBillingEligibility: BillingEligibility = async (
  ctx,
  userId,
) => {
  if (await ctx.runQuery(internal.users.internal.deletionPending, { userId }))
    throw new ConvexError(
      "Account deletion has been requested or this account no longer exists.",
    );
};
export const beginAttempt = createBeginAttempt(requireBillingEligibility);
export const checkout = createCheckout(requireBillingEligibility);
export const snapshot = createSnapshot(requireBillingEligibility);
export {
  setup,
  portal,
  finishAttempt,
  resolveAttempt,
  hasUnknownAttempt,
  hasPendingMonthlyAttempt,
} from "@disposabl/disposabl-kit/server/billing-functions";
