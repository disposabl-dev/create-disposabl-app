import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { ownedApp } from "../internal";
import { pendingDelete, resources } from "../validator";

export function assertActive(app: Doc<"apps">) {
  if (app.operation?.kind === "delete")
    throw new ConvexError(
      "App deletion is in progress. Retry apps delete to finish cleanup.",
    );
}
async function assertPreviewOnly(ctx: Pick<QueryCtx, "db">, appId: string) {
  const release = await ctx.db
    .query("appReleases")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
  if (release)
    throw new ConvexError("Apps with production releases cannot be deleted.");
}

// One lease prevents setup, deletion and production publishing from racing.
export const begin = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    kind: v.union(v.literal("setup"), v.literal("delete")),
  },
  returns: v.object({
    until: v.number(),
    resuming: v.boolean(),
    pending: v.optional(pendingDelete),
    expoManual: v.optional(v.boolean()),
  }),
  handler: async (ctx, { userId, appId, kind }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (kind === "setup") assertActive(app);
    else await assertPreviewOnly(ctx, appId);
    if (app.operation && app.operation.until > Date.now())
      throw new ConvexError(
        "This app has an operation in progress. Try again when it finishes.",
      );
    // Longer than Convex's maximum action runtime, including nested actions.
    const until = Date.now() + 15 * 60_000;
    await ctx.db.patch("apps", app._id, {
      operation: { ...app.operation, kind, until },
    });
    return {
      until,
      resuming: app.operation?.kind === "delete",
      pending: app.operation?.pending,
      expoManual: app.operation?.expoManual,
    };
  },
});
export const finish = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    retryDelete: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, retryDelete }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (app.operation?.until === until)
      await ctx.db.patch("apps", app._id, {
        operation: retryDelete
          ? { ...app.operation, kind: "delete", until: 0 }
          : undefined,
      });
    return null;
  },
});
export const linked = internalQuery({
  args: { ...identityFields, appId: v.string() },
  returns: resources,
  handler: async (ctx, { userId, appId }) => {
    const {
      githubOwner,
      githubRepo,
      convexProjectId,
      expoProjectId,
      expoAccountId,
    } = await ownedApp(ctx, userId, appId);
    return {
      githubOwner,
      githubRepo,
      convexProjectId,
      expoProjectId,
      expoAccountId,
    };
  },
});
export const saveExpo = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    accountId: v.string(),
    projectId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, accountId, projectId }) => {
    const app = await ownedApp(ctx, userId, appId);
    assertActive(app);
    if (
      (app.expoAccountId && app.expoAccountId !== accountId) ||
      (projectId && app.expoProjectId && app.expoProjectId !== projectId)
    )
      throw new ConvexError("App is already linked to another Expo project.");
    await ctx.db.patch("apps", app._id, {
      expoAccountId: accountId,
      ...(projectId ? { expoProjectId: projectId } : {}),
    });
    return null;
  },
});
export const forget = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    provider: v.union(
      v.literal("github"),
      v.literal("convex"),
      v.literal("expo"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, provider }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (app.operation?.kind !== "delete" || app.operation.until !== until)
      throw new ConvexError("Deletion must be restarted.");
    await ctx.db.patch(
      "apps",
      app._id,
      provider === "github"
        ? { githubOwner: undefined, githubRepo: undefined }
        : provider === "convex"
          ? { convexProjectId: undefined }
          : { expoProjectId: undefined, expoAccountId: null },
    );
    return null;
  },
});
export const deletingResource = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    pending: pendingDelete,
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, pending }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (app.operation?.kind !== "delete" || app.operation.until !== until)
      throw new ConvexError("Deletion must be restarted.");
    await ctx.db.patch("apps", app._id, {
      operation: { ...app.operation, pending },
    });
    return null;
  },
});
export const requireExpoDeletion = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    projectId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, projectId }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      app.operation?.kind !== "delete" ||
      app.operation.until !== until ||
      (app.expoProjectId && app.expoProjectId !== projectId) ||
      !app.expoAccountId
    )
      throw new ConvexError("Expo deletion must be restarted.");
    await ctx.db.patch("apps", app._id, {
      expoProjectId: projectId,
      operation: { ...app.operation, expoManual: true },
    });
    return null;
  },
});
export const erase = internalMutation({
  args: { ...identityFields, appId: v.string(), until: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { userId, appId, until }) => {
    const app = await ownedApp(ctx, userId, appId);
    await assertPreviewOnly(ctx, appId);
    if (
      app.operation?.kind !== "delete" ||
      app.operation.until !== until ||
      app.githubRepo ||
      app.convexProjectId ||
      app.expoProjectId ||
      app.expoAccountId
    )
      throw new ConvexError("Linked projects must be deleted first.");
    const previews = await ctx.db
      .query("previews")
      .withIndex("by_appId_reference", (q) => q.eq("appId", appId))
      .take(100);
    for (const preview of previews)
      await ctx.db.delete("previews", preview._id);
    if (previews.length === 100) return false;
    await ctx.db.delete("apps", app._id);
    return true;
  },
});
export const workflow = internalMutation({
  args: { ...identityFields, appId: v.string(), production: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, appId, production }) => {
    const app = await ownedApp(ctx, userId, appId);
    assertActive(app);
    if (
      production &&
      !(await ctx.db
        .query("appReleases")
        .withIndex("by_appId", (q) => q.eq("appId", appId))
        .unique())
    )
      await ctx.db.insert("appReleases", {
        appId,
        releases: {},
        updatedAt: Date.now(),
      });
    return null;
  },
});
