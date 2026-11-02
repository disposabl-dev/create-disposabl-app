import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { appArgs, appIdentity, appResult } from "../schema";
import { github, githubConnection } from "../schema";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
type AppResult = Infer<typeof appResult>;

export { create } from "./actions/create";
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
    if ((app.provisioning?.expiresAt ?? 0) > Date.now())
      throw new ConvexError(
        "Provisioning in progress. Retry deletion shortly.",
      );
    await ctx.db.patch("apps", app._id, { deletedAt: Date.now() });
    const production = await ctx.db
      .query("appReleases")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (production) await ctx.db.delete("appReleases", production._id);
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

function assertAppId(appId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      appId,
    )
  )
    throw new ConvexError("appId must be a lowercase UUID v4.");
}
export async function ownedApp(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  appId: string,
) {
  assertAppId(appId);
  const app = await ctx.db
    .query("apps")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
  if (!app || app.deletedAt !== undefined || app.userId !== userId)
    throw new ConvexError("App not found.");
  return app;
}
function presentApp(app: Doc<"apps">): AppResult {
  return {
    appId: app.appId,
    name: app.name,
    platforms: app.platforms,
    ...(app.github ? { github: app.github } : {}),
    createdAt: app._creationTime,
  };
}
export const githubApp = internalQuery({
  args: appIdentity,
  returns: v.union(
    v.null(),
    v.object({ appId: v.string(), userId: v.string(), github }),
  ),
  handler: async (ctx, { appId }) => {
    assertAppId(appId);
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    return app && !app.deletedAt && app.github
      ? { appId: app.appId, userId: app.userId, github: app.github }
      : null;
  },
});
/** Called only by the trusted GitHub installation setup callback, never a client API. */
export const connectGithub = internalMutation({
  args: { ...identityFields, ...appIdentity, github },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    if (app.github && app.github.repositoryId !== args.github.repositoryId)
      throw new ConvexError("App is already linked to a different repository.");
    await ctx.db.patch("apps", app._id, { github: args.github });
    return null;
  },
});

export const githubSetup = internalQuery({
  args: { ...identityFields, ...appIdentity },
  returns: v.object({
    app: appResult,
    connection: v.union(githubConnection, v.null()),
  }),
  handler: async (ctx, { userId, appId }) => {
    const app = await ownedApp(ctx, userId, appId);
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    return { app: presentApp(app), connection: user?.github ?? null };
  },
});
