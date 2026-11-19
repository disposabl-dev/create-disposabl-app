import {
  identityFields,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { ownedApp } from "../apps/internal";
import { assertActive } from "../apps/operations/internal";
import { assignHost, hostingOrigin } from "./model";
import { internal } from "../_generated/api";

export const register = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    reference: v.optional(v.string()),
    origin: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { userId, appId, reference, origin }) => {
    const app = await ownedApp(ctx, userId, appId);
    assertActive(app);
    if (
      reference !== undefined &&
      !(await ctx.db
        .query("previews")
        .withIndex("by_appId_reference", (q) =>
          q.eq("appId", appId).eq("reference", reference),
        )
        .unique())
    ) {
      await ctx.db.insert("previews", {
        appId,
        reference,
        stage: "building",
        releases: {},
        updatedAt: Date.now(),
      });
    }
    return assignHost(ctx, app, reference, origin);
  },
});

/** Upgrade stored provider links without changing app data or deployment credentials. */
export const backfill = internalMutation({
  args: {
    table: v.union(v.literal("apps"), v.literal("previews")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { table, cursor }) => {
    if (table === "apps") {
      const page = await ctx.db
        .query("apps")
        .paginate({ cursor, numItems: 50 });
      for (const app of page.page) {
        const release = await ctx.db
          .query("appReleases")
          .withIndex("by_appId", (q) => q.eq("appId", app.appId))
          .unique();
        const origin = Object.values(release?.releases ?? {})
          .map((r) => hostingOrigin(r.url))
          .find(Boolean);
        await assignHost(ctx, app, undefined, origin);
      }
      await ctx.scheduler.runAfter(
        0,
        internal.gateway.internal.backfill,
        page.isDone
          ? { table: "previews", cursor: null }
          : { table, cursor: page.continueCursor },
      );
    } else {
      const page = await ctx.db
        .query("previews")
        .paginate({ cursor, numItems: 50 });
      for (const preview of page.page) {
        const app = await ctx.db
          .query("apps")
          .withIndex("by_appId", (q) => q.eq("appId", preview.appId))
          .unique();
        if (!app) continue;
        const origin =
          Object.values(preview.releases)
            .map((r) => hostingOrigin(r.url))
            .find(Boolean) ?? hostingOrigin(preview.deployment?.convexSiteUrl);
        await assignHost(ctx, app, preview.reference, origin);
      }
      if (!page.isDone)
        await ctx.scheduler.runAfter(0, internal.gateway.internal.backfill, {
          table,
          cursor: page.continueCursor,
        });
    }
    return null;
  },
});
