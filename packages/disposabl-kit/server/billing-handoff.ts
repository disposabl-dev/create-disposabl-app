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
import project from "../../../package.json";
import { billingConfig, mobileWebCheckoutConfigured } from "./billing";
import {
  hashBrowserCode as digest,
  exchangeBrowserSession,
} from "./browser-session";

import type { BillingEligibility } from "./billing-functions";

const ttl = 120_000;
const returnTtl = 30 * 60_000;
const allowedChannel = (channel: string | undefined) =>
  !!channel &&
  /^[a-z][a-z0-9-]{0,62}$/.test(channel) &&
  (process.env.BILLING_IOS_RETURN_CHANNELS ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .includes(channel);
async function returnUrl(channel: string) {
  const hash = await digest(project.name);
  return `disposabl-billing-${hash.slice(0, 12)}-${channel}://billing-return`;
}
function accessSessionId(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const value = JSON.parse(
      atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
    );
    return typeof value.sub === "string" && value.sub ? value.sub : null;
  } catch {
    return null;
  }
}
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
  if (!row || row.expiresAt <= Date.now() || row.browserSessionId)
    throw invalid();
  return row;
}
export const createHandoff = (eligibility?: BillingEligibility) =>
  mutation({
    args: {
      purchase: v.union(v.literal("monthly"), v.literal("topup")),
      returnChannel: v.optional(v.string()),
    },
    returns: v.object({ url: v.string(), userId: v.string() }),
    handler: async (ctx, { purchase, returnChannel }) => {
      const config = billingConfig(paymentsEnabled, process.env);
      if (!config || !mobileWebCheckoutConfigured(paymentsEnabled, process.env))
        throw new ConvexError("Website checkout is unavailable.");
      const userId = await getAuthUserId(ctx);
      const identity = await ctx.auth.getUserIdentity();
      if (!userId || !identity) throw invalid();
      await eligibility?.(ctx, userId);
      const code = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
      )
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const hash = await digest(code);
      const channel = allowedChannel(returnChannel) ? returnChannel : undefined;
      const now = Date.now();
      await ctx.db.insert("billingHandoffs", {
        hash,
        userId,
        sessionId: identity.subject,
        purchase,
        ...(channel
          ? { returnChannel: channel, returnExpiresAt: now + returnTtl }
          : {}),
        expiresAt: now + ttl,
      });
      await ctx.scheduler.runAfter(channel ? returnTtl : ttl, cleanupRef, {
        hash,
      });
      const url = new URL("/billing-login", config.returnUrl);
      url.hash = code;
      return { url: url.href, userId };
    },
  });
export const create = createHandoff();
export const inspectHandoff = (eligibility?: BillingEligibility) =>
  query({
    args: { code: v.string() },
    returns: v.union(
      v.null(),
      v.object({ name: v.union(v.string(), v.null()) }),
    ),
    handler: async (ctx, { code }) => {
      try {
        const row = await lookup(ctx, code);
        await eligibility?.(ctx, row.userId);
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
export const inspect = inspectHandoff();
export const redeemHandoff = (eligibility?: BillingEligibility) =>
  mutation({
    args: { code: v.string() },
    returns: v.object({
      accessToken: v.string(),
      refreshToken: v.string(),
      refreshTokenExpiresAt: v.number(),
      userId: v.string(),
      purchase: v.union(v.literal("monthly"), v.literal("topup")),
      expiresAt: v.number(),
      returnClaim: v.union(v.string(), v.null()),
    }),
    handler: async (ctx, { code }) => {
      const row = await lookup(ctx, code);
      await eligibility?.(ctx, row.userId);
      const tokens = await exchangeBrowserSession(
        ctx,
        row.sessionId,
        row.userId,
      );
      const browserSessionId = accessSessionId(tokens.accessToken);
      const hasReturn =
        !!row.returnChannel &&
        allowedChannel(row.returnChannel) &&
        !!browserSessionId;
      if (hasReturn)
        await ctx.db.patch("billingHandoffs", row._id, { browserSessionId });
      else await ctx.db.delete("billingHandoffs", row._id);
      return {
        ...tokens,
        purchase: row.purchase ?? "monthly",
        expiresAt: row.expiresAt,
        returnClaim: hasReturn ? code : null,
      };
    },
  });
export const redeem = redeemHandoff();
export const returnTarget = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({ url: v.string(), expiresAt: v.number() }),
  ),
  handler: async (ctx, { code }) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
    const identity = await ctx.auth.getUserIdentity();
    const userId = await getAuthUserId(ctx);
    if (!identity || !userId) return null;
    const hash = await digest(code);
    const row = await ctx.db
      .query("billingHandoffs")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (
      !row ||
      row.userId !== userId ||
      row.browserSessionId !== identity.subject ||
      !row.returnExpiresAt ||
      row.returnExpiresAt <= Date.now() ||
      !allowedChannel(row.returnChannel)
    )
      return null;
    return {
      url: await returnUrl(row.returnChannel!),
      expiresAt: row.returnExpiresAt,
    };
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
    if (row && (row.returnExpiresAt ?? row.expiresAt) <= Date.now())
      await ctx.db.delete("billingHandoffs", row._id);
    return null;
  },
});
