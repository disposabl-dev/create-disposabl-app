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
