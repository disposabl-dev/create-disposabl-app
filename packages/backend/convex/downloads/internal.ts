import { v } from "convex/values";
import { internalQuery } from "@disposabl/disposabl-kit/server/lib/functions";

export const candidate = internalQuery({
  args: {
    appId: v.string(),
    platform: v.string(),
    userId: v.optional(v.string()),
    reference: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      owner: v.string(),
      repo: v.string(),
      installationId: v.string(),
      releaseUrl: v.string(),
      artifactUrl: v.string(),
      runId: v.number(),
      attempt: v.number(),
      commitSha: v.string(),
      preview: v.boolean(),
    }),
  ),
  handler: async (ctx, { appId, platform, userId, reference }) => {
    // Only the authenticated action supplies userId. Public HTTP downloads
    // always omit both fields and remain restricted to production releases.
    if (reference !== undefined && (!userId || !reference.trim())) return null;
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (
      !app?.githubOwner ||
      (userId !== undefined && app.userId !== userId) ||
      !app.githubRepo ||
      app.operation?.kind === "delete" ||
      !app.platforms.some((p) => p === platform)
    )
      return null;
    const release =
      reference !== undefined
        ? await ctx.db
            .query("previews")
            .withIndex("by_appId_reference", (q) =>
              q.eq("appId", appId).eq("reference", reference),
            )
            .unique()
        : await ctx.db
            .query("appReleases")
            .withIndex("by_appId", (q) => q.eq("appId", appId))
            .unique();
    const latest = release?.releases[platform];
    if (
      latest?.status !== "ready" ||
      !latest.githubReleaseUrl ||
      !latest.artifactUrl
    )
      return null;
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId_owner", (q) =>
        q.eq("userId", app.userId).eq("owner", app.githubOwner!),
      )
      .unique();
    if (!connection) return null;
    return {
      owner: app.githubOwner,
      repo: app.githubRepo,
      installationId: connection.installationId,
      releaseUrl: latest.githubReleaseUrl,
      artifactUrl: latest.artifactUrl,
      runId: latest.run.id,
      attempt: latest.run.attempt,
      commitSha: latest.run.commitSha,
      preview: reference !== undefined,
    };
  },
});
