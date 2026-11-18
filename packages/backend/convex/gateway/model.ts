import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const hostSuffix = ".disposabl.xyz";
export const convexSitePattern = /^https:\/\/[a-z0-9-]+\.convex\.site$/;
export const publicUrl = (slug: string) => `https://${slug}${hostSuffix}`;
export function hostingOrigin(url?: string) {
  try {
    const origin = url ? new URL(url).origin : undefined;
    return origin && convexSitePattern.test(origin) ? origin : undefined;
  } catch {
    return undefined;
  }
}
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function findHost(
  ctx: Pick<QueryCtx, "db">,
  appId: string,
  reference?: string,
) {
  return ctx.db
    .query("appHosts")
    .withIndex("by_appId_reference", (q) =>
      q.eq("appId", appId).eq("reference", reference),
    )
    .unique();
}

/** Reservations survive deletion so a different app cannot inherit old links. */
export async function assignHost(
  ctx: Pick<MutationCtx, "db">,
  app: Doc<"apps">,
  reference?: string,
  origin?: string,
) {
  if (origin && !convexSitePattern.test(origin))
    throw new Error("Invalid hosting origin.");
  const existing = await findHost(ctx, app.appId, reference);
  if (existing) {
    if (origin && existing.origin !== origin)
      await ctx.db.patch("appHosts", existing._id, { origin });
    return publicUrl(existing.slug);
  }
  const production =
    reference === undefined ? null : await findHost(ctx, app.appId);
  const appSlug =
    production?.slug ??
    `${slugify(app.name).slice(0, 30).replace(/-$/, "") || "app"}-${app.appId.slice(0, 8)}`;
  const base =
    reference === undefined
      ? appSlug
      : `${appSlug}-${slugify(reference).slice(0, 16).replace(/-$/, "") || "draft"}`;
  for (let suffix = 0; suffix < 100; suffix++) {
    const slug = suffix ? `${base}-${suffix}` : base;
    if (
      await ctx.db
        .query("appHosts")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    )
      continue;
    await ctx.db.insert("appHosts", {
      appId: app.appId,
      reference,
      slug,
      origin,
    });
    return publicUrl(slug);
  }
  throw new Error("Could not reserve an app hostname.");
}

export async function siteFor(
  ctx: Pick<QueryCtx, "db">,
  appId: string,
  reference?: string,
) {
  const host = await findHost(ctx, appId, reference);
  return host?.origin ? publicUrl(host.slug) : undefined;
}
