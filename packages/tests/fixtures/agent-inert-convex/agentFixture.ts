// Mounted only on a disposable local backend by the fixture runner.
import {
  anyApi,
  internalActionGeneric,
  internalMutationGeneric,
} from "convex/server";
import { v } from "convex/values";

export const noop = internalActionGeneric({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
export const seedLease = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { appId, userId, token }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", appId))
      .unique();
    if (!app || app.userId !== userId || !app.agent || app.agent.lease)
      throw new Error("Fixture app unavailable");
    const watchdog = await ctx.scheduler.runAfter(
      60 * 60_000,
      anyApi.agentFixture.noop,
      {},
    );
    await ctx.db.patch(app._id, {
      agent: {
        ...app.agent,
        lease: { token, watchdog, expiresAt: Date.now() + 60 * 60_000 },
      },
    });
    return null;
  },
});

import { getFunctionName } from "convex/server";
import {
  enqueueMessageHandler,
  abortMessage,
} from "../../../../backend/convex/agent/internal";

// Fixture-only adapter: only the product worker tick may be substituted.
function inertDispatch(ctx: any) {
  return {
    ...ctx,
    scheduler: {
      ...ctx.scheduler,
      runAfter: async (_delay: number, ref: any) => {
        if (getFunctionName(ref) !== "agent/actions/run:tick")
          throw new Error("Unexpected scheduled function in agent fixture");
        return ctx.scheduler.runAfter(0, anyApi.agentFixture.noop, {});
      },
    },
  };
}
export const enqueue = internalMutationGeneric({
  args: {
    userId: v.string(),
    appId: v.string(),
    prompt: v.string(),
    fileIds: v.array(v.id("files")),
  },
  returns: v.any(),
  handler: (ctx, args) =>
    enqueueMessageHandler(inertDispatch(ctx), args, () => true),
});
export const stop = internalMutationGeneric({
  args: { userId: v.string(), appId: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    (abortMessage as any)._handler(inertDispatch(ctx), args),
});
