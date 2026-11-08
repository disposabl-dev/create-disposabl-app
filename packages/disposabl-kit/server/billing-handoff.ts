import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../../backend/convex/_generated/api";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
} from "../../backend/convex/_generated/server";
import { paymentsEnabled } from "../features";
import { billingConfig, mobileWebCheckoutConfigured } from "./billing";
import {
  hashBrowserCode as digest,
  exchangeBrowserSession,
} from "./browser-session";

const ttl = 120_000;
const invalid = () =>
  new ConvexError("This link expired. Open billing again from the app.");
const cleanupRef = makeFunctionReference<"mutation", { hash: string }, null>(
  "billingHandoff:cleanup",
);
async function lookup(ctx: QueryCtx, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw invalid();
  const hash = await digest(code);
  const row = await ctx.db
    .query("billingHandoffs")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .unique();
  if (!row || row.expiresAt <= Date.now()) throw invalid();
  return row;
}
export const create = mutation({
  args: {},
  returns: v.object({ url: v.string(), userId: v.string() }),
  handler: async (ctx) => {
    const config = billingConfig(paymentsEnabled, process.env);
    if (!config || !mobileWebCheckoutConfigured(paymentsEnabled, process.env))
      throw new ConvexError("Website checkout is unavailable.");
    const userId = await getAuthUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    if (!userId || !identity) throw invalid();
    const code = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const hash = await digest(code);
    await ctx.db.insert("billingHandoffs", {
      hash,
      userId,
      sessionId: identity.subject,
      expiresAt: Date.now() + ttl,
    });
    await ctx.scheduler.runAfter(ttl, cleanupRef, { hash });
    const url = new URL("/billing-login", config.returnUrl);
    url.hash = code;
    return { url: url.href, userId };
  },
});
export const inspect = query({
  args: { code: v.string() },
  returns: v.union(v.null(), v.object({ name: v.union(v.string(), v.null()) })),
  handler: async (ctx, { code }) => {
    try {
      const row = await lookup(ctx, code);
      const session = await ctx.runQuery(components.auth.public.getSession, {
        sessionId: row.sessionId,
      });
      if (session?.userId !== row.userId) return null;
      const email = await ctx.runQuery(
        components.authEmail.verifiedEmails.getPrimaryEmail,
        { userId: row.userId },
      );
      const username = await ctx.runQuery(
        components.authUsername.public.getUsername,
        { userId: row.userId },
      );
      const id = ctx.db.normalizeId("users", row.userId);
      const user = id ? await ctx.db.get("users", id) : null;
      return {
        name:
          email ?? user?.profile?.email ?? (username ? `@${username}` : null),
      };
    } catch {
      return null;
    }
  },
});
export const redeem = mutation({
  args: { code: v.string() },
  returns: v.object({
    accessToken: v.string(),
    refreshToken: v.string(),
    refreshTokenExpiresAt: v.number(),
    userId: v.string(),
  }),
  handler: async (ctx, { code }) => {
    const row = await lookup(ctx, code);
    const tokens = await exchangeBrowserSession(ctx, row.sessionId, row.userId);
    await ctx.db.delete("billingHandoffs", row._id);
    return tokens;
  },
});
export const cleanup = internalMutation({
  args: { hash: v.string() },
  returns: v.null(),
  handler: async (ctx, { hash }) => {
    const row = await ctx.db
      .query("billingHandoffs")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (row && row.expiresAt <= Date.now())
      await ctx.db.delete("billingHandoffs", row._id);
    return null;
  },
});
