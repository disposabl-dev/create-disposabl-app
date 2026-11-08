import { internalMutationGeneric } from "convex/server";
import { v } from "convex/values";
export const boundary = internalMutationGeneric({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: () => null,
});
