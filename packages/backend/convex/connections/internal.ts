import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { env } from "../_generated/server";
import {
  connectionStatus,
  oauthProvider,
  provider,
  storedConnection,
  tokenProvider,
} from "./validator";

const connection = (
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  provider: "convex" | "expo",
) =>
  ctx.db
    .query("connections")
    .withIndex("by_userId_provider", (q) =>
      q.eq("userId", userId).eq("provider", provider),
    )
    .unique();

export const status = internalQuery({
  platforms: true,
  args: identityFields,
  returns: connectionStatus,
  handler: async (ctx, { userId }) => {
    const github = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const convex = await connection(ctx, userId, "convex");
    const expo = await connection(ctx, userId, "expo");
    const id = ctx.db.normalizeId("users", userId);
    const confirmed = id
      ? (await ctx.db.get("users", id))?.blacksmith
      : undefined;
    const blacksmith =
      github?.organization &&
      confirmed?.owner === github.owner &&
      confirmed.installationId === github.installationId
        ? { owner: github.owner }
        : null;
    const encrypted = !!env.CONNECTIONS_ENCRYPTION_KEY;
    return {
      github: github
        ? { owner: github.owner, organization: github.organization === true }
        : null,
      blacksmith,
      convex: convex ? { name: convex.name } : null,
      expo: expo ? { name: expo.name } : null,
      ready: !!github?.organization && !!blacksmith && !!convex,
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
        blacksmith: !!github?.organization,
      },
      blacksmithInstallUrl: "https://app.blacksmith.sh",
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
    } else if (provider !== "blacksmith") {
      const row = await connection(ctx, userId, provider);
      if (row) await ctx.db.delete("connections", row._id);
    }
    const id = ctx.db.normalizeId("users", userId);
    if (id)
      await ctx.db.patch("users", id, {
        connectionState: undefined,
        ...(provider === "github" || provider === "blacksmith"
          ? { blacksmith: undefined }
          : {}),
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
  returns: v.string(),
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
    return state.verifier;
  },
});

export const confirmBlacksmith = internalMutation({
  args: { ...identityFields, owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, owner }) => {
    const github = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const id = ctx.db.normalizeId("users", userId);
    if (!id || !github?.organization || github.owner !== owner)
      throw new ConvexError(
        "Choose your GitHub organization before confirming Blacksmith setup.",
      );
    await ctx.db.patch("users", id, {
      blacksmith: {
        owner: github.owner,
        installationId: github.installationId,
        confirmedAt: Date.now(),
      },
    });
    return null;
  },
});
