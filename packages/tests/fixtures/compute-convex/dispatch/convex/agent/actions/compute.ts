import { internalActionGeneric as action } from "convex/server";
import { v } from "convex/values";
// The copied product source changes only its provider import in the runner.
export { renew } from "./productCompute";
export const stop = action({
  args: { sessionId: v.id("computeSessions") },
  handler: () => null,
});
export const notice = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: () => null,
});
