// These public functions belong only to the disposable loopback fixture.
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import * as on from "../generated/on";
import * as removed from "../generated/removed";
import * as off from "../generated/off";

const identity = (ctx: any, user: string, session: string) => ({
  ...ctx,
  auth: { getUserIdentity: async () => ({ subject: session }) },
  runQuery: async () => ({ userId: user }),
  runMutation: async () => ({
    userId: user,
    accessToken: `x.${btoa(JSON.stringify({ sub: session }))}.x`,
    refreshToken: "fixture",
    refreshTokenExpiresAt: Date.now() + 3600000,
  }),
});
export const create = mutation({
  args: {
    user: v.string(),
    session: v.string(),
    purchase: v.union(v.literal("monthly"), v.literal("topup")),
    channel: v.optional(v.string()),
    enabled: v.boolean(),
  },
  handler: (ctx, a) =>
    ((a.enabled ? on.create : off.create) as any)._handler(
      identity(ctx, a.user, a.session),
      {
        purchase: a.purchase,
        ...(a.channel === undefined ? {} : { returnChannel: a.channel }),
      },
    ),
});
export const redeem = mutation({
  args: {
    code: v.string(),
    user: v.string(),
    session: v.string(),
    allowed: v.optional(v.boolean()),
  },
  handler: (ctx, a) =>
    ((a.allowed === false ? removed.redeem : on.redeem) as any)._handler(
      identity(ctx, a.user, a.session),
      {
        code: a.code,
      },
    ),
});
export const target = query({
  args: {
    code: v.string(),
    user: v.string(),
    session: v.string(),
    allowed: v.boolean(),
  },
  handler: (ctx, a) =>
    ((a.allowed ? on.returnTarget : removed.returnTarget) as any)._handler(
      identity(ctx, a.user, a.session),
      { code: a.code },
    ),
});
export const expire = mutation({
  args: {
    code: v.string(),
    field: v.union(v.literal("handoff"), v.literal("return")),
  },
  handler: async (ctx, a) => {
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a.code)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const row = await ctx.db
      .query("billingHandoffs")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!row) throw new Error("fixture row missing");
    await ctx.db.patch(
      row._id,
      a.field === "handoff" ? { expiresAt: 0 } : { returnExpiresAt: 0 },
    );
  },
});
