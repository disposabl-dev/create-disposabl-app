import { internalActionGeneric as internalAction } from "convex/server";
import { v } from "convex/values";
export const stop = internalAction({
  args: { sessionId: v.id("computeSessions") },
  handler: () => null,
});
export const notice = internalAction({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: () => null,
});

export const renew = internalAction({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: () => null,
});
