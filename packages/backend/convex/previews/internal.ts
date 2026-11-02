import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { ownedApp, platform } from "../apps/model";
import {
  platformKey,
  initialPlatforms,
  previewIdentity,
  previewResult,
  release,
  validateReference,
  validateLink,
} from "./model";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function findPreview(
  ctx: Pick<QueryCtx, "db">,
  args: { appId: string; reference: string },
) {
  validateReference(args.reference);
  return ctx.db
    .query("previews")
    .withIndex("by_appId_reference", (q) =>
      q.eq("appId", args.appId).eq("reference", args.reference),
    )
    .unique();
}
function present({
  _id: _unusedId,
  _creationTime: _unusedTime,
  ...preview
}: Doc<"previews">) {
  const site = preview.deployment?.convexSiteUrl;
  if (site)
    for (const [name, path] of [
      ["web", ""],
      ["api", "/openapi.json"],
      ["mcp", "/mcp"],
    ] as const) {
      const state = preview.platforms[name];
      if (state?.enabled)
        preview.platforms[name] = { ...state, url: site + path };
    }
  return preview;
}
export const ensure = internalMutation({
  args: { ...identityFields, ...previewIdentity },
  returns: previewResult,
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    const existing = await findPreview(ctx, args);
    if (existing) return present(existing);
    const id = await ctx.db.insert("previews", {
      appId: args.appId,
      reference: args.reference,
      platforms: initialPlatforms(app.platforms),
      updatedAt: Date.now(),
    });
    return present((await ctx.db.get("previews", id))!);
  },
});
export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, ...previewIdentity },
  returns: v.union(previewResult, v.null()),
  handler: async (ctx, args) => {
    await ownedApp(ctx, args.userId, args.appId);
    const preview = await findPreview(ctx, args);
    return preview ? present(preview) : null;
  },
});
export const list = internalQuery({
  platforms: true,
  args: {
    ...identityFields,
    appId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(previewResult),
  handler: async (ctx, { userId, appId, paginationOpts }) => {
    await ownedApp(ctx, userId, appId);
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      throw new ConvexError("Page size must be between 1 and 100.");
    const result = await ctx.db
      .query("previews")
      .withIndex("by_appId_reference", (q) => q.eq("appId", appId))
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(present) };
  },
});
export const update = internalMutation({
  platforms: true,
  args: {
    ...identityFields,
    ...previewIdentity,
    platform,
    latest: release,
    githubUrl: v.optional(v.string()),
  },
  returns: previewResult,
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    if (!app.platforms.includes(args.platform))
      throw new ConvexError("Platform is disabled for this app.");
    if (!Number.isSafeInteger(args.latest.revision) || args.latest.revision < 0)
      throw new ConvexError("Revision must be a non-negative safe integer.");
    validateLink(args.githubUrl, true);
    for (const key of [
      "url",
      "githubReleaseUrl",
      "artifactUrl",
      "updateUrl",
    ] as const)
      validateLink(args.latest[key], key === "githubReleaseUrl");
    let preview = await findPreview(ctx, args);
    if (!preview) {
      const id = await ctx.db.insert("previews", {
        appId: args.appId,
        reference: args.reference,
        platforms: initialPlatforms(app.platforms),
        updatedAt: Date.now(),
      });
      preview = (await ctx.db.get("previews", id))!;
    }
    const previous = preview.platforms[platformKey(args.platform)];
    if (
      previous?.enabled &&
      previous.latest &&
      args.latest.revision < previous.latest.revision
    )
      throw new ConvexError("Stale preview update.");
    await ctx.db.patch("previews", preview._id, {
      platforms: {
        ...preview.platforms,
        [platformKey(args.platform)]: { enabled: true, latest: args.latest },
      },
      ...(args.githubUrl !== undefined ? { githubUrl: args.githubUrl } : {}),
      updatedAt: Date.now(),
    });
    return present((await ctx.db.get("previews", preview._id))!);
  },
});
