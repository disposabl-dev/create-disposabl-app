import { internalMutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { claimWindow } from "@PRODUCT@/agent/compute";
export { get, settle, uncertain } from "@PRODUCT@/agent/compute";
// Product claim logic, explicitly paid only in this isolated fixture.
export const claim = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.optional(v.id("computeDebits")),
  },
  handler: (ctx, args) => claimWindow(ctx as any, args, true),
});
export const boundary = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: () => null,
});
