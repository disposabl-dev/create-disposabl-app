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
import { appArgs, appResult } from "../validator";
import { githubConnection } from "../validator";
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
    const id = await ctx.db.insert("apps", {
      userId: args.userId,
      appId: args.appId,
      name,
      platforms,
      expoAccountId: null,
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
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(presentApp) };
  },
});
export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, appId: v.string() },
  returns: appResult,
  handler: async (ctx, { userId, appId }) =>
    presentApp(await ownedApp(ctx, userId, appId)),
});
export { remove as delete } from "./actions/delete";

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
  if (!app || app.userId !== userId) throw new ConvexError("App not found.");
  return app;
}
function presentApp(app: Doc<"apps">): AppResult {
  return {
    appId: app.appId,
    name: app.name,
    platforms: app.platforms,
    ...(app.githubOwner ? { githubOwner: app.githubOwner } : {}),
    ...(app.githubRepo ? { githubRepo: app.githubRepo } : {}),
    createdAt: app._creationTime,
  };
}
export const githubApp = internalQuery({
  args: { appId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      githubOwner: v.string(),
      githubRepo: v.string(),
      installationId: v.string(),
      userId: v.string(),
    }),
  ),
  handler: async (ctx, { appId }) => {
    assertAppId(appId);
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (!app?.githubOwner || !app.githubRepo) return null;
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId_owner", (q) =>
        q.eq("userId", app.userId).eq("owner", app.githubOwner!),
      )
      .unique();
    const installationId = connection?.installationId;
    return installationId
      ? {
          githubOwner: app.githubOwner,
          githubRepo: app.githubRepo,
          installationId,
          userId: app.userId,
        }
      : null;
  },
});
/** Only trusted repository provisioning can link an app. */
export const connectGithub = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    githubOwner: v.string(),
    githubRepo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, githubOwner, githubRepo }) => {
    const app = await ownedApp(ctx, userId, appId);
    githubOwner = githubOwner.toLowerCase();
    if (
      app.githubOwner &&
      (app.githubOwner !== githubOwner || app.githubRepo !== githubRepo)
    )
      throw new ConvexError("App is already linked to a different repository.");
    await ctx.db.patch("apps", app._id, { githubOwner, githubRepo });
    return null;
  },
});
export const githubSetup = internalQuery({
  args: { ...identityFields, appId: v.string() },
  returns: v.object({
    app: appResult,
    connection: v.union(githubConnection, v.null()),
  }),
  handler: async (ctx, { userId, appId }) => {
    const app = await ownedApp(ctx, userId, appId);
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return {
      app: presentApp(app),
      connection: connection
        ? {
            owner: connection.owner,
            installationId: connection.installationId,
          }
        : null,
    };
  },
});

export const project = internalQuery({
  args: { ...identityFields, appId: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { userId, appId }) =>
    (await ownedApp(ctx, userId, appId)).convexProjectId ?? null,
});
export const saveProject = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    projectId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    await ctx.db.patch("apps", app._id, { convexProjectId: args.projectId });
    return null;
  },
});
