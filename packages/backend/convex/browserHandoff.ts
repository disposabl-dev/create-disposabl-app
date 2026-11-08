import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  hashBrowserCode as hash,
  exchangeBrowserSession,
} from "@disposabl/disposabl-kit/server/browser-session";
import { connectionsUrl } from "./connections/config";

const lifetime = 2 * 60_000;
const invalid = () =>
  new ConvexError("This link expired. Open connections again from the app.");
async function lookup(ctx: QueryCtx, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw invalid();
  const digest = await hash(code);
  const user = await ctx.db
    .query("users")
    .withIndex("by_browserHandoffHash", (q) =>
      q.eq("browserHandoff.hash", digest),
    )
    .unique();
  if (!user?.browserHandoff || user.browserHandoff.expiresAt <= Date.now())
    throw invalid();
  return user;
}

/** A verified mobile session authorizes one browser sign-in, never a shared refresh token. */
export const create = mutation({
  args: { mobile: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (ctx, { mobile }) => {
    const userId = await getAuthUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const id = userId ? ctx.db.normalizeId("users", userId) : null;
    if (!id || !identity || !(await ctx.db.get("users", id)))
      throw new ConvexError("Sign in to open your connections.");
    const code = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    await ctx.db.patch("users", id, {
      browserHandoff: {
        hash: await hash(code),
        sessionId: identity.subject,
        expiresAt: Date.now() + lifetime,
      },
    });
    const url = new URL("/mobile-login", connectionsUrl());
    if (mobile) url.searchParams.set("mobile", "1");
    url.hash = code;
    return url.href;
  },
});

/** Identity preview allows an explicit account choice before changing a browser session. */
export const inspect = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({ userId: v.string(), name: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { code }) => {
    try {
      const user = await lookup(ctx, code);
      const session = await ctx.runQuery(components.auth.public.getSession, {
        sessionId: user.browserHandoff!.sessionId,
      });
      if (session?.userId !== user._id) return null;
      const username = await ctx.runQuery(
        components.authUsername.public.getUsername,
        { userId: user._id },
      );
      const email = await ctx.runQuery(
        components.authEmail.verifiedEmails.getPrimaryEmail,
        { userId: user._id },
      );
      const name =
        email ?? user.profile?.email ?? (username ? `@${username}` : null);
      return { userId: user._id, name };
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
    const user = await lookup(ctx, code);
    const tokens = await exchangeBrowserSession(
      ctx,
      user.browserHandoff!.sessionId,
      user._id,
    );
    // The component call and consumption commit atomically; replay cannot mint another session.
    await ctx.db.patch("users", user._id, { browserHandoff: undefined });
    return tokens;
  },
});
