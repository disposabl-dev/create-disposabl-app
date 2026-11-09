import { internalActionGeneric as action, anyApi } from "convex/server";
import { v } from "convex/values";
import { deliverNotice } from "./productCompute";
export { renew } from "./productCompute";
// The handler uses the real notice logic with a synthetic balance; its queue
// points to the fixture marker, while the deployment's product queue stays off.
export const notice = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: async (ctx, { debitId, attempt }) => {
    const debit = await ctx.runQuery(anyApi.agent.compute.getDebit, {
      debitId,
    });
    return deliverNotice(ctx as any, debitId as any, attempt, {
      enabled: true,
      environment: "production",
      observe: async () => debit?.responseBalance ?? 20,
    });
  },
});
export const stop = action({
  args: { sessionId: v.id("computeSessions") },
  handler: () => null,
});
