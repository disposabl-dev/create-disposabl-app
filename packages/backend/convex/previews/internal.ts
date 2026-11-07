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
import { scheduleTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";
import { assertActive } from "../apps/operations/internal";
import { ownedApp } from "../apps/internal";
import {
  deployment,
  platform,
  platformNames,
  previewIdentity,
  previewResult,
  releaseDetails,
  run,
} from "../validator";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export function validateReference(reference: string) {
  if (
    !reference ||
    reference !== reference.trim() ||
    reference.length > 200 ||
    [...reference].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new ConvexError(
      "Provide a branch, worktree, or PR name (1–200 characters, no whitespace).",
    );
}
const platformKey = (name: string) =>
  name === "typescript-sdk" ? "sdk" : name;
export function presentPlatforms(
  app: Doc<"apps">,
  releases: Doc<"previews">["releases"],
  site?: string,
) {
  const routes: Record<string, string> = {
    web: "",
    api: "/openapi.json",
    mcp: "/mcp",
  };
  return Object.fromEntries(
    platformNames.map((name) => {
      const release = releases[platformKey(name)];
      const { url: releasedUrl, ...latest } = release ?? {};
      const url =
        releasedUrl ??
        (site && Object.hasOwn(routes, name) ? site + routes[name] : undefined);
      const enabled = app.platforms.includes(name);
      return [
        platformKey(name),
        {
          enabled,
          ...(enabled && url ? { url } : {}),
          ...(release
            ? {
                latest: { ...latest, status: release.status, run: release.run },
              }
            : {}),
        },
      ];
    }),
  );
}
function present(
  preview: Doc<"previews">,
  app: Doc<"apps">,
): Infer<typeof previewResult> {
  return {
    appId: preview.appId,
    reference: preview.reference,
    stage: preview.stage,
    ...(preview.deployment ? { deployment: preview.deployment } : {}),
    updatedAt: preview.updatedAt,
    platforms: presentPlatforms(
      app,
      preview.releases,
      preview.deployment?.convexSiteUrl,
    ),
  };
}
async function findPreview(
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
export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, ...previewIdentity },
  returns: v.union(previewResult, v.null()),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    const preview = await findPreview(ctx, args);
    return preview ? present(preview, app) : null;
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
    const app = await ownedApp(ctx, userId, appId);
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
    return {
      ...result,
      page: result.page.map((preview) => present(preview, app)),
    };
  },
});
export const create = internalMutation({
  args: { ...identityFields, ...previewIdentity },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    const preview = await findPreview(ctx, args);
    if (preview)
      await ctx.db.patch("previews", preview._id, {
        stage: "generating",
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("previews", {
        appId: args.appId,
        reference: args.reference,
        stage: "generating",
        releases: {},
        updatedAt: Date.now(),
      });
    return app.convexProjectId ?? null;
  },
});
export const finish = internalMutation({
  args: { ...identityFields, ...previewIdentity, deployment },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownedApp(ctx, args.userId, args.appId);
    const preview = await findPreview(ctx, args);
    if (!preview) throw new ConvexError("Preview not found.");
    await ctx.db.patch("previews", preview._id, {
      deployment: args.deployment,
      updatedAt: Date.now(),
    });
    return null;
  },
});
/** Only the GitHub OIDC HTTP handler can report build outcomes. */
export const report = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    githubOwner: v.string(),
    githubRepo: v.string(),
    reference: v.string(),
    production: v.boolean(),
    run,
    platform,
    ...releaseDetails,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    assertActive(app);
    if (
      app.githubOwner !== args.githubOwner ||
      app.githubRepo !== args.githubRepo
    )
      throw new ConvexError("Repository is not linked to this app.");
    if (!app.platforms.includes(args.platform)) return null;
    validateReference(args.reference);
    const table = args.production ? "appReleases" : "previews";
    const existing = args.production
      ? await ctx.db
          .query("appReleases")
          .withIndex("by_appId", (q) => q.eq("appId", args.appId))
          .unique()
      : await findPreview(ctx, args);
    const key = platformKey(args.platform);
    const previous = existing?.releases[key];
    if (previous) {
      if (
        args.run.id < previous.run.id ||
        (args.run.id === previous.run.id &&
          args.run.attempt < previous.run.attempt)
      )
        return null;
      if (
        args.run.id === previous.run.id &&
        args.run.attempt === previous.run.attempt &&
        previous.status !== "building" &&
        args.status !== "failed"
      )
        return null;
    }
    const transition =
      (args.status === "ready" || args.status === "failed") &&
      !(
        previous?.status === args.status &&
        previous.run.id === args.run.id &&
        previous.run.attempt === args.run.attempt
      );
    if (transition)
      await scheduleTelemetry(
        ctx,
        "platform_deployment",
        {
          platform: args.platform,
          channel: args.production ? "production" : "preview",
          outcome: args.status === "ready" ? "success" : "error",
          duration_ms: Date.now() - app._creationTime,
        },
        args.userId,
      );
    const {
      userId: _user,
      appId: _app,
      githubOwner: _owner,
      githubRepo: _repo,
      reference: _ref,
      production: _prod,
      platform: _platform,
      ...latest
    } = args;
    const values = {
      releases: { ...existing?.releases, [key]: latest },
      updatedAt: Date.now(),
    };
    if (table === "appReleases") {
      const record = existing as Doc<"appReleases"> | null;
      if (record) await ctx.db.patch("appReleases", record._id, values);
      else await ctx.db.insert("appReleases", { appId: args.appId, ...values });
    } else {
      const record = existing as Doc<"previews"> | null;
      if (record)
        await ctx.db.patch("previews", record._id, {
          ...values,
          stage: "building",
        });
      else
        await ctx.db.insert("previews", {
          appId: args.appId,
          reference: args.reference,
          stage: "building",
          ...values,
        });
    }
    return null;
  },
});
