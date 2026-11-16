import { internal } from "../_generated/api";
import { v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";

const args = {
  userId: v.id("users"),
  expectedRequestedAt: v.number(),
  reference: v.string(),
  token: v.string(),
};
const timeout = 11 * 60_000;

/** Explicit operator retry after reconciling the recorded hold. */
export const resume = internalMutation({
  args: {
    userId: v.id("users"),
    expectedRequestedAt: v.number(),
    reference: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, expectedRequestedAt, reference }) => {
    const user = await ctx.db.get("users", userId);
    if (
      !user ||
      user.deletionRequestedAt !== expectedRequestedAt ||
      user.deletionAutomation?.state !== "blocked"
    )
      return false;
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (
      !receipt ||
      receipt.ownerId !== userId ||
      receipt.requestedAt !== expectedRequestedAt
    )
      return false;
    const token = crypto.randomUUID();
    await ctx.db.patch("users", userId, {
      deletionAutomation: {
        state: "scheduled",
        token,
        steps: 0,
        waits: 0,
        updatedAt: Date.now(),
        nextAt: Date.now(),
      },
    });
    await ctx.scheduler.runAfter(
      0,
      internal.users.actions.fulfillment.automate,
      {
        userId,
        expectedRequestedAt,
        reference,
        token,
      },
    );
    return true;
  },
});

/** Claim exactly one scheduled step; an expired worker is held, not replayed. */
export const claim = internalMutation({
  args,
  returns: v.boolean(),
  handler: async (ctx, { userId, expectedRequestedAt, reference, token }) => {
    const user = await ctx.db.get("users", userId);
    const task = user?.deletionAutomation;
    if (
      !user ||
      user.deletionRequestedAt !== expectedRequestedAt ||
      task?.state !== "scheduled" ||
      task.token !== token
    )
      return false;
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (
      !receipt ||
      receipt.ownerId !== userId ||
      receipt.requestedAt !== expectedRequestedAt
    )
      return false;
    await ctx.db.patch("users", userId, {
      deletionAutomation: {
        ...task,
        state: "running",
        updatedAt: Date.now(),
        nextAt: undefined,
      },
    });
    await ctx.scheduler.runAfter(timeout, internal.users.automation.expire, {
      userId,
      expectedRequestedAt,
      reference,
      token,
    });
    return true;
  },
});

export const expire = internalMutation({
  args,
  returns: v.null(),
  handler: async (ctx, { userId, expectedRequestedAt, token }) => {
    const user = await ctx.db.get("users", userId);
    const task = user?.deletionAutomation;
    if (
      user?.deletionRequestedAt === expectedRequestedAt &&
      task?.state === "running" &&
      task.token === token &&
      task.updatedAt + timeout <= Date.now()
    )
      await ctx.db.patch("users", userId, {
        deletionAutomation: {
          ...task,
          state: "blocked",
          updatedAt: Date.now(),
          detail:
            "Cleanup worker timed out; provider outcome may be unknown. Operator review is required.",
        },
      });
    return null;
  },
});

export const finish = internalMutation({
  args: {
    ...args,
    outcome: v.union(
      v.literal("advanced"),
      v.literal("blocked"),
      v.literal("failed"),
    ),
    detail: v.string(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { userId, expectedRequestedAt, reference, token, outcome, detail },
  ) => {
    const user = await ctx.db.get("users", userId);
    const task = user?.deletionAutomation;
    if (
      !user ||
      user.deletionRequestedAt !== expectedRequestedAt ||
      task?.state !== "running" ||
      task.token !== token
    )
      return null;
    const waiting =
      outcome === "blocked" &&
      detail === "Agent worker or activation lease is still active.";
    const steps = task.steps + Number(outcome === "advanced");
    const waits = waiting ? task.waits + 1 : 0;
    if (
      outcome === "failed" ||
      (outcome === "blocked" && !waiting) ||
      waits > 12 ||
      steps >= 1000
    ) {
      await ctx.db.patch("users", userId, {
        deletionAutomation: {
          ...task,
          state: "blocked",
          steps,
          waits,
          updatedAt: Date.now(),
          detail:
            outcome === "failed"
              ? "Cleanup failed or a provider outcome is unknown. Operator review is required."
              : waits > 12
                ? "Agent work did not drain after repeated checks. Operator review is required."
                : steps >= 1000
                  ? "Cleanup reached its step limit. Operator review is required."
                  : detail,
        },
      });
      return null;
    }
    const delay = waiting
      ? Math.min(30_000 * 2 ** Math.min(waits - 1, 2), 120_000)
      : 250;
    const nextToken = crypto.randomUUID();
    await ctx.db.patch("users", userId, {
      deletionAutomation: {
        state: "scheduled",
        token: nextToken,
        steps,
        waits,
        updatedAt: Date.now(),
        nextAt: Date.now() + delay,
        detail,
      },
    });
    await ctx.scheduler.runAfter(
      delay,
      internal.users.actions.fulfillment.automate,
      { userId, expectedRequestedAt, reference, token: nextToken },
    );
    return null;
  },
});
