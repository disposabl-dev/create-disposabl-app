import {
  identityFields,
  internalMutation,
  internalQuery,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { scheduleTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";
import {
  appArgs,
  appResult,
  platform,
  feature,
  androidArchitecture,
} from "../validator";
import { resolveFeatures } from "@disposabl/disposabl-kit/feature-options";
import { requireConnections } from "../connections/config";
import { internal } from "../_generated/api";
import {
  defaultAndroidArchitectures,
  validateAndroidArchitectures,
} from "../../../disposabl-kit/android-architectures";
import { validatePlatforms } from "@disposabl/disposabl-kit/platforms";
import { githubConnection } from "../validator";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { result as agentResult } from "../agent/validator";
type AppResult = Infer<typeof appResult>;

export { create } from "./actions/create";
export const repositoryToken = internalAction({
  platforms: true,
  args: { ...identityFields, appId: v.string() },
  returns: v.object({ token: v.string(), repository: v.string() }),
  handler: async (ctx, args): Promise<{ token: string; repository: string }> =>
    ctx.runAction(internal.apps.actions.repository.token, args),
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
    validateAndroidArchitectures(
      args.androidArchitectures ?? defaultAndroidArchitectures,
    );
    const id = await ctx.db.insert("apps", {
      userId: args.userId,
      agentRemoteUnresolved: false,
      agentResumeBusy: false,
      appId: args.appId,
      name,
      platforms,
      features: resolveFeatures(args.features ?? []),
      androidArchitectures: [...defaultAndroidArchitectures],
      expoAccountId: null,
    });
    await scheduleTelemetry(
      ctx,
      "app_created",
      { app_id: args.appId },
      args.userId,
    );
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
export const update = internalMutation({
  platforms: true,
  args: {
    ...identityFields,
    appId: v.string(),
    platforms: v.array(platform),
    features: v.optional(v.array(feature)),
    androidArchitectures: v.optional(v.array(androidArchitecture)),
  },
  returns: appResult,
  handler: async (
    ctx,
    { userId, appId, platforms, features, androidArchitectures },
  ): Promise<AppResult> => {
    const app = await ownedApp(ctx, userId, appId);
    if (app.operation)
      throw new ConvexError(
        "Wait for app setup to finish before changing platforms.",
      );
    const selected = validatePlatforms(platforms);
    const selectedFeatures = resolveFeatures(features ?? app.features ?? []);
    const architectures = validateAndroidArchitectures(
      androidArchitectures ??
        app.androidArchitectures ??
        defaultAndroidArchitectures,
    );
    requireConnections(
      await ctx.runQuery(internal.connections.internal.status, {
        userId,
        features: selectedFeatures,
      }),
      selected,
    );
    await ctx.db.patch("apps", app._id, {
      platforms: selected,
      features: selectedFeatures,
      androidArchitectures: architectures,
    });
    return presentApp({
      ...app,
      platforms: selected,
      features: selectedFeatures,
      androidArchitectures: architectures,
    });
  },
});
/** Commit selections only after setup succeeds, while holding its existing lease. */
export const applyConfiguration = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    platforms: v.array(platform),
    features: v.array(feature),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, platforms, features }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      app.operation?.kind !== "setup" ||
      app.operation.until !== until ||
      until <= Date.now()
    )
      throw new ConvexError("App setup lease expired. Retry setup.");
    await ctx.db.patch("apps", app._id, { platforms, features });
    return null;
  },
});

const configurationArgs = {
  ...identityFields,
  appId: v.string(),
  platforms: v.array(platform),
  features: v.array(feature),
  androidArchitectures: v.optional(v.array(androidArchitecture)),
};
function configurationPrompt(
  appId: string,
  platforms: string[],
  features: string[],
  architectures: readonly string[],
) {
  const selected = validatePlatforms(platforms);
  const selectedFeatures = resolveFeatures(features);
  return `Apply this configuration change to the existing app repository. Requested platforms: ${selected.join(",")}. Requested features: ${selectedFeatures.join(",") || "none"}.
Read the generator version from this app's disposabl.json. Use that exact version (not latest) with the existing-project reconfiguration flow from /home/user/apps: bun create disposabl-app@<matching-version> ${appId} --platforms ${selected.join(",")} --features ${selectedFeatures.join(",") || "none"} --android-architectures ${validateAndroidArchitectures(architectures).join(",")} --yes.
If the matching generator does not support --android-architectures, stop and report that a supported generator upgrade or migration is required; do not retry with latest or claim the change applied. Preserve this app ID, source customizations and user data. Restore newly selected platform/auth files using the generator; do not scaffold a replacement. Complete its existing setup/provisioning flow and run the selected-platform checks. If a template conflict or account connection blocks setup, explain the exact blocker and stop. Report applied files, setup outcome and test evidence; a queued request or metadata update alone is not completion.`;
}

/** Queue repository changes; applied selections are synchronized by generator setup. */
export const requestConfiguration = internalAction({
  platforms: true,
  args: configurationArgs,
  returns: agentResult,
  handler: async (
    ctx,
    { userId, appId, platforms, features, androidArchitectures },
  ): Promise<Infer<typeof agentResult>> => {
    const app = await ctx.runQuery(internal.apps.internal.get, {
      userId,
      appId,
    });
    return ctx.runAction(internal.agent.internal.sendMessage, {
      userId,
      appId,
      prompt: configurationPrompt(
        appId,
        platforms,
        features,
        androidArchitectures ??
          app.androidArchitectures ??
          defaultAndroidArchitectures,
      ),
    });
  },
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
    androidArchitectures: validateAndroidArchitectures(
      app.androidArchitectures ?? defaultAndroidArchitectures,
    ),
    features: app.features ?? [],
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
