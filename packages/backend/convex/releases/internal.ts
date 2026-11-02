import {
  identityFields,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { appIdentity, releasesResult } from "../schema";
import { ownedApp } from "../apps/internal";
import { presentPlatforms } from "../previews/internal";

export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, ...appIdentity },
  returns: v.union(releasesResult, v.null()),
  handler: async (ctx, { userId, appId }) => {
    const app = await ownedApp(ctx, userId, appId);
    const release = await ctx.db
      .query("appReleases")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    return release
      ? {
          appId,
          platforms: presentPlatforms(app, release.releases),
          updatedAt: release.updatedAt,
        }
      : null;
  },
});
