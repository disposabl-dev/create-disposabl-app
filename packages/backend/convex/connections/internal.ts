import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { env } from "../_generated/server";
import { feature } from "../validator";
import { connectionsUrl } from "./config";
import {
  connectionStatus,
  oauthProvider,
  provider,
  storedConnection,
  tokenProvider,
  posthogRegion,
} from "./validator";

const connection = (
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  provider: "convex" | "expo" | "posthog",
) =>
  ctx.db
    .query("connections")
    .withIndex("by_userId_provider", (q) =>
      q.eq("userId", userId).eq("provider", provider),
    )
    .unique();

export const status = internalQuery({
  platforms: true,
  args: { ...identityFields, features: v.optional(v.array(feature)) },
  returns: connectionStatus,
  handler: async (ctx, { userId, features = [] }) => {
    const github = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const convex = await connection(ctx, userId, "convex");
    const expo = await connection(ctx, userId, "expo");
    const posthog = await connection(ctx, userId, "posthog");
    const missing: Array<"github" | "convex" | "posthog"> = [];
    if (!github) missing.push("github");
    if (!convex) missing.push("convex");
    if (features.includes("analytics") && !posthog?.accountId)
      missing.push("posthog");
    const encrypted = !!env.CONNECTIONS_ENCRYPTION_KEY;
    return {
      github: github
        ? { owner: github.owner, organization: github.organization === true }
        : null,
      convex: convex ? { name: convex.name } : null,
      expo: expo ? { name: expo.name } : null,
      posthog: posthog?.accountId ? { name: posthog.name } : null,
      posthogPending: !!posthog && !posthog.accountId,
      ready: missing.length === 0,
      missing,
      connectionsUrl: connectionsUrl(features),
      available: {
        github:
          encrypted &&
          !!env.VERCEL_TOKEN &&
          !!env.VERCEL_PROJECT_ID &&
          !!env.VERCEL_TEAM_ID &&
          !!env.GITHUB_CONNECTOR &&
          !!env.GITHUB_APP_SLUG,
        convex:
          encrypted &&
          !!env.CONVEX_OAUTH_CLIENT_ID &&
          !!env.CONVEX_OAUTH_CLIENT_SECRET,
        expo: encrypted,
        posthog: encrypted,
      },
      githubInstallUrl: env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`
        : null,
    };
  },
});
export const get = internalQuery({
  args: { ...identityFields, provider: tokenProvider },
  returns: v.union(storedConnection, v.null()),
  handler: async (ctx, { userId, provider }) => {
    const row = await connection(ctx, userId, provider);
    return row
      ? { accountId: row.accountId, name: row.name, token: row.token }
      : null;
  },
});
export const save = internalMutation({
  args: {
    ...identityFields,
    provider: tokenProvider,
    ...storedConnection.fields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await connection(ctx, args.userId, args.provider);
    if (row) await ctx.db.replace("connections", row._id, args);
    else await ctx.db.insert("connections", args);
    return null;
  },
});
export const disconnect = internalMutation({
  args: { ...identityFields, provider },
  returns: v.null(),
  handler: async (ctx, { userId, provider }) => {
    if (provider === "github") {
      for await (const row of ctx.db
        .query("githubConnections")
        .withIndex("by_userId", (q) => q.eq("userId", userId)))
        await ctx.db.delete("githubConnections", row._id);
    } else {
      const row = await connection(ctx, userId, provider);
      if (row) await ctx.db.delete("connections", row._id);
    }
    const id = ctx.db.normalizeId("users", userId);
    if (id)
      await ctx.db.patch("users", id, {
        connectionState: undefined,
      });
    return null;
  },
});
export const begin = internalMutation({
  args: {
    ...identityFields,
    provider: oauthProvider,
    hash: v.string(),
    verifier: v.string(),
    region: v.optional(posthogRegion),
  },
  returns: v.null(),
  handler: async (ctx, { userId, ...state }) => {
    const id = ctx.db.normalizeId("users", userId);
    if (!id) throw new ConvexError("Invalid userId.");
    await ctx.db.patch("users", id, {
      connectionState: { ...state, expiresAt: Date.now() + 10 * 60_000 },
    });
    return null;
  },
});
export const consume = internalMutation({
  args: { ...identityFields, provider: oauthProvider, hash: v.string() },
  returns: v.object({
    verifier: v.string(),
    region: v.optional(posthogRegion),
  }),
  handler: async (ctx, { userId, provider, hash }) => {
    const id = ctx.db.normalizeId("users", userId);
    const state = id
      ? (await ctx.db.get("users", id))?.connectionState
      : undefined;
    if (
      !id ||
      !state ||
      state.provider !== provider ||
      state.hash !== hash ||
      state.expiresAt < Date.now()
    )
      throw new ConvexError(
        "This connection link has expired. Please connect again.",
      );
    await ctx.db.patch("users", id, { connectionState: undefined });
    return { verifier: state.verifier, region: state.region };
  },
});
