import {
  identityFields,
  internalAction,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import {
  appArgs,
  appIdentity,
  appResult,
  assertAppId,
  ownedApp,
  presentApp,
  type AppResult,
} from "./model";

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...appArgs },
  returns: appResult,
  handler: async (ctx, args): Promise<AppResult> =>
    ctx.runMutation(internal.apps.internal.insert, {
      ...args,
      appId: args.appId ?? crypto.randomUUID(),
    }),
});
export const insert = internalMutation({
  args: { ...identityFields, ...appArgs, appId: v.string() },
  returns: appResult,
  handler: async (ctx, args) => {
    assertAppId(args.appId);
    const name = args.name.trim();
    if (!name || name.length > 214)
      throw new ConvexError("App name must contain 1–214 characters.");
    const platforms = [...new Set(args.platforms)];
    const existing = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", args.appId))
      .unique();
    if (existing) {
      if (
        existing.deletedAt !== undefined ||
        existing.userId !== args.userId ||
        existing.name !== name ||
        JSON.stringify([...existing.platforms].sort()) !==
          JSON.stringify([...platforms].sort())
      )
        throw new ConvexError("App ID already in use.");
      return presentApp(existing);
    }
    const id = await ctx.db.insert("apps", {
      userId: args.userId,
      appId: args.appId,
      name,
      platforms,
    });
    return presentApp((await ctx.db.get("apps", id))!);
  },
});
export const list = internalQuery({
  platforms: true,
  args: { ...identityFields, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(appResult),
  handler: async (ctx, { userId, paginationOpts }) => {
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      throw new ConvexError("Page size must be between 1 and 100.");
    const result = await ctx.db
      .query("apps")
      .withIndex("by_userId_deletedAt", (q) =>
        q.eq("userId", userId).eq("deletedAt", undefined),
      )
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(presentApp) };
  },
});
export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, ...appIdentity },
  returns: appResult,
  handler: async (ctx, { userId, appId }) =>
    presentApp(await ownedApp(ctx, userId, appId)),
});
const remove = internalMutation({
  platforms: true,
  args: { ...identityFields, ...appIdentity },
  returns: v.null(),
  handler: async (ctx, { userId, appId }) => {
    const app = await ownedApp(ctx, userId, appId);
    if ((app.provisioningUntil ?? 0) > Date.now())
      throw new ConvexError(
        "Provisioning in progress. Retry deletion shortly.",
      );
    await ctx.db.patch("apps", app._id, { deletedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.apps.internal.cleanupPreviews, {
      appId,
    });
    return null;
  },
});
export { remove as delete };
export const cleanupPreviews = internalMutation({
  args: appIdentity,
  returns: v.null(),
  handler: async (ctx, { appId }) => {
    const batch = await ctx.db
      .query("previews")
      .withIndex("by_appId_reference", (q) => q.eq("appId", appId))
      .take(100);
    for (const preview of batch) await ctx.db.delete("previews", preview._id);
    if (batch.length === 100)
      await ctx.scheduler.runAfter(0, internal.apps.internal.cleanupPreviews, {
        appId,
      });
    return null;
  },
});
