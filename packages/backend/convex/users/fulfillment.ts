import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { components } from "../_generated/api";
import { hasLiveActivation, hasLiveAgentWorker } from "./deletion";

const args = { userId: v.id("users"), expectedRequestedAt: v.number() };

export const completedReceipt = internalQuery({
  args: { reference: v.string(), expectedRequestedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { reference, expectedRequestedAt }) => {
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    return (
      !!receipt &&
      receipt.requestedAt === expectedRequestedAt &&
      receipt.completedAt !== undefined &&
      receipt.ownerId === undefined
    );
  },
});

export const requestMatches = internalQuery({
  args: { ...args, reference: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, expectedRequestedAt, reference }) => {
    const user = await ctx.db.get("users", userId);
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    return (
      !!user &&
      user.deletionRequestedAt === expectedRequestedAt &&
      !!receipt &&
      receipt.ownerId === userId &&
      receipt.requestedAt === expectedRequestedAt &&
      receipt.completedAt === undefined
    );
  },
});

/** Fence provisioning before the provider call, including a lost response. */
export const markProvisioning = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId("users", userId);
    const user = id && (await ctx.db.get("users", id));
    if (!id || !user || user.deletionRequestedAt !== undefined)
      throw new ConvexError("Account deletion is pending.");
    if (user.managedSandbox?.state === "never")
      await ctx.db.patch("users", id, {
        managedSandbox: { state: "uncertain" },
      });
    return null;
  },
});

/** Capture provider identity in the same transaction as the drain check. */
export const prepare = internalMutation({
  args,
  returns: v.object({
    state: v.union(
      v.literal("never"),
      v.literal("known"),
      v.literal("deleted"),
      v.literal("blocked"),
    ),
    sandboxId: v.union(v.string(), v.null()),
    reason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      return {
        state: "blocked" as const,
        sandboxId: null,
        reason: "Agent worker or activation lease is still active.",
      };
    const apps = await ctx.db
      .query("apps")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(101);
    if (
      apps.length > 100 ||
      apps.some(
        (app) =>
          (app.operation?.until ?? 0) > Date.now() ||
          app.agentResumeBusy ||
          app.agentRemoteUnresolved ||
          app.agent?.stopUnconfirmed ||
          (app.agent &&
            (["processing", "stopping"].includes(app.agent.status) ||
              app.agent.pending.length > 0 ||
              !!app.agent.delivery)),
      )
    )
      return {
        state: "blocked" as const,
        sandboxId: null,
        reason: "App work or operations require reconciliation.",
      };
    const sessions = await ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(101);
    if (
      sessions.length > 100 ||
      sessions.some(
        (s) =>
          s.state !== "stopped" ||
          !s.stopConfirmed ||
          s.activationLease ||
          s.stopLease ||
          s.reconciliationConflict ||
          s.untrackedConflicts,
      )
    )
      return {
        state: "blocked" as const,
        sandboxId: null,
        reason: "Compute sessions require reconciliation.",
      };
    const state = user.managedSandbox;
    if (!state)
      return {
        state: "blocked" as const,
        sandboxId: null,
        reason: "Historical sandbox and thread provenance is unknown.",
      };
    if (state?.state === "deleted")
      return {
        state: "deleted" as const,
        sandboxId: state.sandboxId ?? null,
        reason: null,
      };
    const record = await ctx.runQuery(components.boat.sandboxes.get, {
      ownerId: userId,
      key: "workspace",
    });
    if (state?.state === "never" && !record)
      return { state: "never" as const, sandboxId: null, reason: null };
    const id = state?.sandboxId ?? record?.sandboxId;
    if (!id || (record?.sandboxId && record.sandboxId !== id))
      return {
        state: "blocked" as const,
        sandboxId: null,
        reason: "Sandbox identity is missing or mismatched.",
      };
    await ctx.db.patch("users", userId, {
      managedSandbox: { state: "known", sandboxId: id },
    });
    return { state: "known" as const, sandboxId: id, reason: null };
  },
});

/** Only the provider action records success for the exact previously captured ID. */
export const markSandboxDeleted = internalMutation({
  args: { ...args, sandboxId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, expectedRequestedAt, sandboxId }) => {
    const user = await ctx.db.get("users", userId);
    if (
      !user ||
      user.deletionRequestedAt !== expectedRequestedAt ||
      user.managedSandbox?.state !== "known" ||
      user.managedSandbox.sandboxId !== sandboxId
    )
      throw new ConvexError("Sandbox deletion identity changed.");
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      throw new ConvexError("Agent work remains active.");
    await ctx.db.patch("users", userId, {
      managedSandbox: { state: "deleted", sandboxId },
    });
    return null;
  },
});

export const app = internalMutation({
  args,
  returns: v.union(
    v.null(),
    v.object({ appId: v.string(), threadId: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    const app = await ctx.db
      .query("apps")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!app) return null;
    if (
      (app.operation?.until ?? 0) > Date.now() ||
      (app.agent?.lease?.expiresAt ?? 0) > Date.now() ||
      app.agentResumeBusy ||
      app.agentRemoteUnresolved ||
      app.agent?.stopUnconfirmed ||
      (app.agent &&
        (["processing", "stopping"].includes(app.agent.status) ||
          app.agent.pending.length > 0 ||
          !!app.agent.delivery))
    )
      throw new ConvexError("App has unresolved work or an active operation.");
    return { appId: app.appId, threadId: app.agent?.threadId ?? null };
  },
});

/** Remove only our local project records; external user-owned projects are preserved. */
export const eraseAppBatch = internalMutation({
  args: { ...args, appId: v.string(), threadId: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, { userId, expectedRequestedAt, appId, threadId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      throw new ConvexError("Agent work remains active.");
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (
      !app ||
      app.userId !== userId ||
      (app.agent?.threadId ?? null) !== threadId
    )
      throw new ConvexError("App identity changed.");
    if (
      (app.operation?.until ?? 0) > Date.now() ||
      app.agentResumeBusy ||
      app.agentRemoteUnresolved ||
      app.agent?.stopUnconfirmed ||
      (app.agent &&
        (["processing", "stopping"].includes(app.agent.status) ||
          app.agent.pending.length > 0 ||
          !!app.agent.delivery))
    )
      throw new ConvexError("App work remains unresolved.");
    if (threadId) {
      const [thread, messages, streams] = await Promise.all([
        ctx.runQuery(components.agent.threads.getThread, { threadId }),
        ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId,
          order: "asc",
          paginationOpts: { cursor: null, numItems: 1 },
        }),
        ctx.runQuery(components.agent.streams.list, {
          threadId,
          statuses: ["streaming", "finished", "aborted"],
        }),
      ]);
      if (thread || messages.page.length || streams.length)
        throw new ConvexError("Agent thread cleanup remains incomplete.");
      const events = await ctx.db
        .query("agentEvents")
        .withIndex("by_threadId_eventId", (q) => q.eq("threadId", threadId))
        .take(100);
      for (const row of events) await ctx.db.delete("agentEvents", row._id);
      if (events.length === 100) return false;
    }
    const previews = await ctx.db
      .query("previews")
      .withIndex("by_appId_reference", (q) => q.eq("appId", appId))
      .take(100);
    for (const row of previews) await ctx.db.delete("previews", row._id);
    if (previews.length === 100) return false;
    const release = await ctx.db
      .query("appReleases")
      .withIndex("by_appId", (q) => q.eq("appId", appId))
      .unique();
    if (release) await ctx.db.delete("appReleases", release._id);
    await ctx.db.delete("apps", app._id);
    return true;
  },
});

/** Clear local connection credentials only after app records are gone. */
export const clearConnections = internalMutation({
  args,
  returns: v.boolean(),
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    if (
      await ctx.db
        .query("apps")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first()
    )
      throw new ConvexError("App cleanup remains incomplete.");
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", userId))
      .take(100);
    const github = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    if (connections.some((c) => (c.refreshingUntil ?? 0) > Date.now()))
      throw new ConvexError("A connection refresh remains active.");
    for (const row of connections) await ctx.db.delete("connections", row._id);
    for (const row of github) await ctx.db.delete("githubConnections", row._id);
    return connections.length < 100 && github.length < 100;
  },
});

/** Final verification and account removal share one transaction. */
export const complete = internalMutation({
  args: { ...args, reference: v.string() },
  returns: v.union(v.literal("completed"), v.literal("already_completed")),
  handler: async (ctx, { userId, expectedRequestedAt, reference }) => {
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!receipt || receipt.requestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching receipt not found.");
    const user = await ctx.db.get("users", userId);
    if (
      !user &&
      receipt.completedAt !== undefined &&
      receipt.ownerId === undefined
    )
      return "already_completed" as const;
    if (
      !user ||
      receipt.ownerId !== userId ||
      user.deletionRequestedAt !== expectedRequestedAt
    )
      throw new ConvexError("Matching deletion request not found.");
    if (
      !user.managedSandbox ||
      !["never", "deleted"].includes(user.managedSandbox.state)
    )
      throw new ConvexError("Managed sandbox cleanup is unverified.");
    if (
      await ctx.runQuery(components.boat.sandboxes.get, {
        ownerId: userId,
        key: "workspace",
      })
    )
      throw new ConvexError("Managed sandbox record remains.");
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      throw new ConvexError("Agent work remains active.");
    if (
      user.mcpDeletion?.state !== "attributed_complete" ||
      user.authDeletion?.state !== "linked_auth_cleared" ||
      user.ephemeralDeletion?.requestedAt !== expectedRequestedAt ||
      user.ephemeralDeletion.state !== "known_user_bound_cleared" ||
      user.fileDeletion?.state !== "known_convex_cleared"
    )
      throw new ConvexError("Local cleanup progress remains incomplete.");
    const [
      apps,
      files,
      handoffs,
      identities,
      consents,
      reports,
      connections,
      github,
      sessions,
      billingAttempt,
    ] = await Promise.all([
      ctx.db
        .query("apps")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("files")
        .withIndex("by_owner_provider", (q) => q.eq("owner", userId))
        .first(),
      ctx.db
        .query("billingHandoffs")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("telemetryIdentities")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("aiConsents")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("aiReports")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("connections")
        .withIndex("by_userId_provider", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("githubConnections")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("computeSessions")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(101),
      ctx.db
        .query("billingAttempts")
        .withIndex("by_userId_requestId", (q) => q.eq("userId", userId))
        .first(),
    ]);
    if (
      apps ||
      files ||
      handoffs ||
      identities ||
      consents ||
      reports ||
      connections ||
      github
    )
      throw new ConvexError("Owned local records remain.");
    if (billingAttempt)
      throw new ConvexError(
        "Local billing attempts require retention or deletion reconciliation.",
      );
    if (
      sessions.length > 100 ||
      sessions.some(
        (s) =>
          s.state !== "stopped" ||
          !s.stopConfirmed ||
          s.activationLease ||
          s.stopLease ||
          s.reconciliationConflict ||
          s.untrackedConflicts,
      )
    )
      throw new ConvexError("Compute sessions require reconciliation.");
    await ctx.db.patch("deletionReceipts", receipt._id, {
      ownerId: undefined,
      completedAt: Date.now(),
    });
    await ctx.db.delete("users", userId);
    return "completed" as const;
  },
});
