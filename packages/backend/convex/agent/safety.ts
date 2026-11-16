import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "../_generated/server";
import { components } from "../_generated/api";
import { getActiveSessionUserId } from "../users/deletion";
import { ownedApp } from "../apps/internal";
import schema from "../schema";

import { CONSENT_VERSION } from "./disclosure";
export async function consented(ctx: Pick<QueryCtx, "db">, userId: string) {
  const consent = await ctx.db
    .query("aiConsents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return consent?.granted === true && consent.version === CONSENT_VERSION;
}
export async function requireConsent(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  if (!(await consented(ctx, userId)))
    throw new ConvexError(
      "AI sharing permission is required before sending a request.",
    );
}
export const hasConsent = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: (ctx, { userId }) => consented(ctx, userId),
});
export const status = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getActiveSessionUserId(ctx);
    return userId ? consented(ctx, userId) : false;
  },
});
export const setConsent = mutation({
  args: { granted: v.boolean(), version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getActiveSessionUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to manage AI sharing.");
    if (args.version !== CONSENT_VERSION)
      throw new ConvexError(
        "The AI sharing disclosure has changed. Review it again.",
      );
    const existing = await ctx.db
      .query("aiConsents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const value = {
      userId,
      version: CONSENT_VERSION,
      granted: args.granted,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch("aiConsents", existing._id, value);
    else await ctx.db.insert("aiConsents", value);
    return null;
  },
});
const reason = v.union(
  v.literal("offensive"),
  v.literal("unsafe"),
  v.literal("other"),
);
export async function createReport(
  ctx: MutationCtx,
  userId: string,
  args: {
    appId: string;
    messageId: string;
    reason: "offensive" | "unsafe" | "other";
  },
) {
  const app = await ownedApp(ctx, userId, args.appId);
  if (!app.agent) throw new ConvexError("Response unavailable.");
  const [message] = await ctx.runQuery(
    components.agent.messages.getMessagesByIds,
    { messageIds: [args.messageId] },
  );
  if (
    !message ||
    message.threadId !== app.agent.threadId ||
    message.message?.role !== "assistant"
  )
    throw new ConvexError("Response unavailable.");
  return ctx.db.insert("aiReports", {
    userId,
    appId: args.appId,
    threadId: app.agent.threadId,
    messageId: args.messageId,
    reason: args.reason,
    status: "open",
  });
}
export const report = mutation({
  args: { appId: v.string(), messageId: v.string(), reason },
  returns: v.id("aiReports"),
  handler: async (ctx, args) => {
    const userId = await getActiveSessionUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to report a response.");
    return createReport(ctx, userId, args);
  },
});
export const inspectReports = internalQuery({
  args: { status: v.union(v.literal("open"), v.literal("resolved")) },
  returns: v.array(schema.doc("aiReports")),
  handler: (ctx, { status }) =>
    ctx.db
      .query("aiReports")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(100),
});
export const inspectReport = internalQuery({
  args: { id: v.id("aiReports") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { id }) => {
    const report = await ctx.db.get("aiReports", id);
    if (!report) return null;
    const [message] = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      { messageIds: [report.messageId] },
    );
    return message?.threadId === report.threadId &&
      message.message?.role === "assistant"
      ? (message.text ?? null)
      : null;
  },
});
export const resolveReport = internalMutation({
  args: { id: v.id("aiReports"), operator: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, operator }) => {
    if (!operator.trim() || operator.length > 200)
      throw new ConvexError("Operator is required.");
    const report = await ctx.db.get("aiReports", id);
    if (!report || report.status !== "open")
      throw new ConvexError("Open report not found.");
    await ctx.db.patch("aiReports", id, {
      status: "resolved",
      resolvedAt: Date.now(),
      operator: operator.trim(),
    });
    return null;
  },
});
