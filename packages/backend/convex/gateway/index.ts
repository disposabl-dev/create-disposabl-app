import { v } from "convex/values";
import { query } from "../_generated/server";
import { hostResolution } from "../validator";
import { convexSitePattern } from "./model";

/** Public routing metadata only. The destination app enforces its own authentication. */
export const resolve = query({
  args: { hostname: v.string() },
  returns: hostResolution,
  handler: async (ctx, { hostname }) => {
    const slug =
      /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.disposabl\.xyz$/.exec(
        hostname,
      )?.[1];
    if (!slug) return null;
    const host = await ctx.db
      .query("appHosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!host?.origin || !convexSitePattern.test(host.origin)) return null;
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", host.appId))
      .unique();
    if (!app || app.operation?.kind === "delete") return null;
    if (
      host.reference !== undefined &&
      !(await ctx.db
        .query("previews")
        .withIndex("by_appId_reference", (q) =>
          q.eq("appId", host.appId).eq("reference", host.reference!),
        )
        .unique())
    )
      return null;
    return { origin: host.origin };
  },
});
