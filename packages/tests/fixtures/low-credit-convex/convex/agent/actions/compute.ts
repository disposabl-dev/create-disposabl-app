import { internalActionGeneric } from "convex/server";
import { v } from "convex/values";
// These scheduled actions are inert. No provider or sandbox is contacted.
export const notice = internalActionGeneric({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: () => null,
});
export const stop = internalActionGeneric({
  args: { sessionId: v.id("computeSessions") },
  handler: () => null,
});
