import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deletionPending } from "../users/deletion";
import { classifyResumeSafety, normalizeRemoteWork } from "./threads";
import { computeSessionArgs } from "./computeValidator";

// The claiming action itself must make the provider call; handing the token to
// a later action would invalidate this bound on the in-flight action lifetime.
const ACTION_FENCE_MS = 11 * 60_000;
async function latest(
  ctx: MutationCtx,
  userId: string,
  id: Id<"computeSessions">,
) {
  const session = await ctx.db
    .query("computeSessions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return session?._id === id;
}
async function close(ctx: MutationCtx, id: Id<"computeSessions">) {
  await ctx.db.patch("computeSessions", id, { state: "stopping" });
  await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
    sessionId: id,
  });
}
export async function claimActivation(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions">; token: string },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.state !== "active" ||
    session.paidUntil <= Date.now() ||
    !(await latest(ctx, session.userId, args.sessionId)) ||
    (await deletionPending(ctx, session.userId))
  )
    return "blocked" as const;
  if (session.activation !== "fresh") return "blocked" as const;
  const work = await normalizeRemoteWork(ctx, session.userId);
  if (work.pending) return "wait" as const;
  if (work.unresolved) return "blocked" as const;
  const safety = await classifyResumeSafety(
    ctx,
    session.userId,
    args.sessionId,
  );
  if (safety !== "ready") return safety;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "claimed",
    activationLease: { token: args.token, until: Date.now() + ACTION_FENCE_MS },
  });
  return "claimed" as const;
}
export async function completeActivation(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions">; token: string },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.activation !== "claimed" ||
    session.activationLease?.token !== args.token
  )
    return false;
  if (
    session.state !== "active" ||
    session.paidUntil <= Date.now() ||
    session.activationLease.until <= Date.now() ||
    !(await latest(ctx, session.userId, args.sessionId)) ||
    (await deletionPending(ctx, session.userId))
  )
    return false;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "active",
    activationLease: undefined,
  });
  return true;
}
export async function uncertainActivation(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions">; token: string },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.activation !== "claimed" ||
    session.activationLease?.token !== args.token
  )
    return false;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "uncertain",
  });
  if (
    session.state === "active" ||
    session.state === "starting" ||
    session.state === "renewing"
  )
    await close(ctx, args.sessionId);
  return true;
}
export async function archiveStop(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions"> },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (!session || session.state !== "active" || session.activation === "fresh")
    return false;
  await close(ctx, args.sessionId);
  return true;
}
export const claim = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.union(
    v.literal("blocked"),
    v.literal("wait"),
    v.literal("claimed"),
  ),
  handler: claimActivation,
});
export const complete = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.boolean(),
  handler: completeActivation,
});
export const uncertain = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.boolean(),
  handler: uncertainActivation,
});
export const archived = internalMutation({
  args: computeSessionArgs,
  returns: v.boolean(),
  handler: archiveStop,
});
