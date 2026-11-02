import { v } from "convex/values";
import { internalQuery } from "@disposabl/disposabl-kit/server/lib/functions";

export const candidate = internalQuery({
  args: { appId: v.string(), platform: v.string() },
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
    }),
  ),
  handler: async (ctx, { appId, platform }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (
      !app?.githubOwner ||
      !app.githubRepo ||
      app.operation?.kind === "delete" ||
      !app.platforms.some((p) => p === platform)
    )
      return null;
    const release = await ctx.db
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
    };
  },
});
