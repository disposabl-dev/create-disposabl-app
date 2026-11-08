import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import {
  stage,
  complete,
} from "../../../../backend/convex/previews/token/internal";
import { applyConfiguration } from "../../../../backend/convex/apps/internal";
const identity = { userId: v.string(), appId: v.string(), until: v.number() };
export const create = mutation({
  args: { appId: v.string(), userId: v.string(), until: v.number() },
  handler: (ctx, a) =>
    ctx.db.insert("apps", {
      appId: a.appId,
      userId: a.userId,
      name: "fixture",
      platforms: ["web"],
      features: [],
      androidArchitectures: ["arm64-v8a"],
      operation: {
        kind: "setup",
        until: a.until,
        ...(a.keepStaged && app!.operation?.androidArchitectures
          ? { androidArchitectures: app!.operation.androidArchitectures }
          : {}),
      },
    }),
});
export const stageSelection = mutation({
  args: { ...identity, androidArchitectures: v.array(v.string()) },
  handler: (ctx, a) => (stage as any)._handler(ctx, a),
});
export const finish = mutation({
  args: identity,
  handler: (ctx, a) => (complete as any)._handler(ctx, a),
});
export const ordinaryPreview = mutation({
  args: identity,
  handler: (ctx, a) =>
    (applyConfiguration as any)._handler(ctx, {
      ...a,
      platforms: ["web"],
      features: [],
    }),
});
export const replaceLease = mutation({
  args: {
    appId: v.string(),
    until: v.number(),
    keepStaged: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", a.appId))
      .unique();
    await ctx.db.patch(app!._id, {
      operation: { kind: "setup", until: a.until },
    });
  },
});
export const state = query({
  args: { appId: v.string() },
  handler: (ctx, a) =>
    ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", a.appId))
      .unique(),
});
