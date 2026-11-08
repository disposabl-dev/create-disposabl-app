import { internalMutationGeneric, internalQueryGeneric } from "convex/server";
import { v } from "convex/values";
export const boundary = internalMutationGeneric({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: () => null,
});

import {
  notice as realNotice,
  getDebit as realGetDebit,
  get as realGet,
  claimWindow,
  settle as realSettle,
} from "../../../../../backend/convex/agent/compute";
export const notice = internalMutationGeneric({
  args: { debitId: v.id("computeDebits"), failed: v.optional(v.boolean()) },
  handler: (ctx, args) => (realNotice as any)._handler(ctx, args),
});
export const getDebit = internalQueryGeneric({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) => (realGetDebit as any)._handler(ctx, args),
});

export const get = internalQueryGeneric({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, args) => (realGet as any)._handler(ctx, args),
});
export const claim = internalMutationGeneric({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.optional(v.id("computeDebits")),
  },
  handler: (ctx, args) => claimWindow(ctx as any, args as any, true),
});
export const settle = internalMutationGeneric({
  args: {
    debitId: v.id("computeDebits"),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
    responseBalance: v.optional(v.number()),
  },
  handler: (ctx, args) => (realSettle as any)._handler(ctx, args),
});
export const uncertain = internalMutationGeneric({
  args: { debitId: v.id("computeDebits") },
  handler: () => null,
});
