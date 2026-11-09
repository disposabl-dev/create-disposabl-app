// Synthetic data and local-only wrappers; never deploy this fixture to an app backend.
import {
  mutationGeneric as mutation,
  queryGeneric as query,
  anyApi,
  componentsGeneric,
} from "convex/server";
import { v } from "convex/values";
const c = componentsGeneric();
export const create = mutation({
  args: { requestedAt: v.optional(v.number()) },
  handler: async (ctx, { requestedAt }) =>
    ctx.db.insert(
      "users",
      requestedAt === undefined ? {} : { deletionRequestedAt: requestedAt },
    ),
});
export const seed = mutation({
  args: { userId: v.id("users"), count: v.number() },
  handler: async (ctx, { userId, count }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("billingHandoffs", {
        hash: `${userId}-${i}`,
        userId,
        sessionId: "synthetic",
        expiresAt: 1,
      });
      await ctx.db.insert("telemetryIdentities", {
        hash: `${userId}-${i}`,
        userId,
        expiresAt: 1,
      });
    }
  },
});
export const key = mutation({
  args: { userId: v.id("users"), hash: v.string() },
  handler: (ctx, { userId, hash }) =>
    ctx.runMutation(c.mcp.grants.createApiKey, {
      userId,
      hash,
      name: "fixture",
      scopes: [],
      resource: "http://localhost/mcp",
    }),
});
export const username = mutation({
  args: { userId: v.id("users"), username: v.string() },
  handler: (ctx, args) =>
    ctx.runMutation(c.authUsername.public.setUsername, args),
});
export const legacy = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.patch("users", userId, {
      authDeletion: {
        state: "linked_auth_cleared",
        batches: 1,
        passwordsDeleted: 0,
        accountsDeleted: 0,
        sessionsDeleted: 0,
        refreshTokensDeleted: 0,
        passwordsCleared: true,
        linkedRowsCleared: true,
        legacyOrphansUnverified: true,
        updatedAt: 1,
      },
    }),
});
export const r2 = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.insert("files", {
      owner: userId,
      filename: "fixture",
      mediaType: "text/plain",
      size: 1,
      location: {
        provider: "r2",
        account: "synthetic",
        bucket: "synthetic",
        key: "synthetic",
      },
    }),
});
export const removeFixtureFile = mutation({
  args: { userId: v.id("users"), fileId: v.id("files") },
  handler: async (ctx, { userId, fileId }) => {
    const file = await ctx.db.get("files", fileId);
    if (
      !file ||
      file.owner !== userId ||
      file.location.provider !== "r2" ||
      file.location.key !== "synthetic"
    )
      throw new Error("Not a synthetic fixture file");
    await ctx.db.delete("files", fileId);
  },
});
export const advance = mutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  handler: (ctx, args) =>
    ctx.runMutation(anyApi.users.localDeletion.advanceLocalBatch, args),
});
export const inspect = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get("users", userId),
});
