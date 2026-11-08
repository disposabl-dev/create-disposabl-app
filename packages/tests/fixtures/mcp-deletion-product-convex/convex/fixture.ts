// Synthetic local-only wrappers; never deploy this fixture to an app backend.
import {
  mutationGeneric as mutation,
  queryGeneric as query,
  componentsGeneric,
} from "convex/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requestDeletion,
  deletionStatus,
} from "../../../../backend/convex/users/index";
import { runBatch } from "../../../../backend/convex/users/mcpDeletion";
import { deletionRequests } from "../../../../backend/convex/users/internal";
import { accountEligibility } from "../../../../backend/convex/agent/api_policy";
import { createPlatforms } from "../../../../disposabl-kit/server/lib/platform-spec";
import { read } from "./fixture/internal";
const mcp = componentsGeneric().mcp;
const identity = (ctx: any, userId: string | null) => ({
  ...ctx,
  auth: {
    getUserIdentity: async () =>
      userId ? { subject: "fixture-session" } : null,
  },
  runQuery: async () => (userId ? { userId } : null),
});
export const create = mutation({
  args: { label: v.string() },
  returns: v.id("users"),
  handler: (ctx, args) => ctx.db.insert("users", args),
});
export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await ctx.db.delete("users", userId);
    return null;
  },
});
export const request = mutation({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: (ctx, { userId }) =>
    (requestDeletion as any)._handler(identity(ctx, userId), {
      confirmation: "DELETE",
    }),
});
export const status = query({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: (ctx, { userId }) =>
    (deletionStatus as any)._handler(identity(ctx, userId), {}),
});
export const progress = query({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) =>
    (await ctx.db.get("users", userId))?.mcpDeletion ?? null,
});
export const queue = query({
  args: {},
  returns: v.any(),
  handler: (ctx) =>
    (deletionRequests as any)._handler(ctx, {
      paginationOpts: { numItems: 100, cursor: null },
    }),
});
export const batch = mutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: v.any(),
  handler: (ctx, args) => (runBatch as any)._handler(ctx, args),
});
export const key = mutation({
  args: { userId: v.id("users"), hash: v.string() },
  returns: v.string(),
  handler: (ctx, { userId, hash }) =>
    ctx.runMutation(mcp.grants.createApiKey, {
      userId,
      hash,
      name: "fixture",
      scopes: [],
      resource: "http://localhost/mcp",
    }),
});
export const verify = query({
  args: { hash: v.string() },
  returns: v.any(),
  handler: (ctx, { hash }) =>
    ctx.runQuery(mcp.tokens.verify, { hash, now: Date.now() }),
});
export const dispatch = query({
  args: { hash: v.string() },
  returns: v.string(),
  handler: async (ctx, { hash }) => {
    const user = await ctx.runQuery(mcp.tokens.verify, {
      hash,
      now: Date.now(),
    });
    if (!user) throw new Error("Credential unavailable");
    const platforms = createPlatforms(
      { "fixture/internal": { read } },
      accountEligibility,
    );
    return (await platforms.tools.fixture_internal_read.handler(
      ctx as any,
      {},
      {
        userId: user.userId,
        scopes: [],
        clientId: "fixture",
        connectionId: "fixture",
      },
    )) as string;
  },
});

export const requestReal = mutation({
  args: {},
  returns: v.any(),
  handler: (ctx) =>
    (requestDeletion as any)._handler(ctx, { confirmation: "DELETE" }),
});
export const statusReal = query({
  args: {},
  returns: v.any(),
  handler: (ctx) => (deletionStatus as any)._handler(ctx, {}),
});
export const whoami = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: (ctx) => getAuthUserId(ctx),
});
