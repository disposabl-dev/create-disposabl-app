import { v } from "convex/values";

export const computeSessionFields = {
  userId: v.string(),
  state: v.union(
    v.literal("starting"),
    v.literal("active"),
    v.literal("stopping"),
    v.literal("stopped"),
    v.literal("hold"),
  ),
  paidUntil: v.number(),
  debitId: v.optional(v.id("computeDebits")),
  stopConfirmed: v.optional(v.boolean()),
  stopLease: v.optional(v.object({ token: v.string(), until: v.number() })),
};
export const computeDebitFields = {
  sessionId: v.id("computeSessions"),
  state: v.union(
    v.literal("dispatching"),
    v.literal("confirmed"),
    v.literal("denied"),
    v.literal("unknown"),
  ),
  paidUntil: v.number(),
  noticeComplete: v.optional(v.boolean()),
  responseBalance: v.optional(v.number()),
  noticeOutcome: v.optional(
    v.union(
      v.literal("queued"),
      v.literal("disabled"),
      v.literal("no_verified_email"),
      v.literal("not_low"),
      v.literal("expired"),
      v.literal("invalid_user"),
      v.literal("missing_balance"),
      v.literal("failed"),
    ),
  ),
  resolution: v.optional(
    v.object({
      outcome: v.union(v.literal("confirmed"), v.literal("denied")),
      evidence: v.string(),
      operator: v.string(),
      resolvedAt: v.number(),
    }),
  ),
};
export const computeSessionArgs = { sessionId: v.id("computeSessions") };
