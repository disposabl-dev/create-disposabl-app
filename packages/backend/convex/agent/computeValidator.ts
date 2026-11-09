import { v } from "convex/values";

export const computeSessionFields = {
  userId: v.string(),
  state: v.union(
    v.literal("starting"),
    v.literal("renewing"),
    v.literal("active"),
    v.literal("stopping"),
    v.literal("stopped"),
    v.literal("hold"),
  ),
  paidUntil: v.number(),
  activation: v.optional(
    v.union(
      v.literal("fresh"),
      v.literal("claimed"),
      v.literal("active"),
      v.literal("uncertain"),
    ),
  ),
  activationLease: v.optional(
    v.object({ token: v.string(), until: v.number() }),
  ),
  debitId: v.optional(v.id("computeDebits")),
  stopConfirmed: v.optional(v.boolean()),
  stopLease: v.optional(v.object({ token: v.string(), until: v.number() })),
  reconciliationConflict: v.optional(v.boolean()),
  conflictDebits: v.optional(v.array(v.id("computeDebits"))),
  untrackedConflicts: v.optional(v.boolean()),
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
  noticeBalance: v.optional(v.number()),
  noticeObservedAt: v.optional(v.number()),
  lateConfirmation: v.optional(
    v.object({
      observedAt: v.number(),
      responseBalance: v.optional(v.number()),
    }),
  ),
  reconciliationConflict: v.optional(v.boolean()),
  conflictResolution: v.optional(
    v.object({
      evidence: v.string(),
      operator: v.string(),
      resolvedAt: v.number(),
    }),
  ),
  noticeOutcome: v.optional(
    v.union(
      v.literal("queued"),
      v.literal("disabled"),
      v.literal("account_ineligible"),
      v.literal("no_verified_email"),
      v.literal("not_low"),
      v.literal("expired"),
      v.literal("invalid_user"),
      v.literal("superseded"),
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
