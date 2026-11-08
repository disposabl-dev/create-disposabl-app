import { internalMutationGeneric as internalMutation } from "convex/server";
import { v } from "convex/values";
export const uncertain = internalMutation({
  args: { debitId: v.id("computeDebits") },
  handler: () => null,
});
export const boundary = internalMutation({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: () => null,
});
export const noop = internalMutation({ args: {}, handler: () => null });

import { settle as realSettle } from "../../../../../backend/convex/agent/compute";
export const settle = internalMutation({
  args: {
    debitId: v.id("computeDebits"),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
  },
  handler: (ctx, args) => (realSettle as any)._handler(ctx, args),
});
