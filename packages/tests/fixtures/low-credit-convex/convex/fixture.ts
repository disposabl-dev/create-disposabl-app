import {
  mutationGeneric as mutation,
  queryGeneric as query,
  actionGeneric as action,
  getFunctionName,
  makeFunctionReference,
  componentsGeneric,
} from "convex/server";
import { v } from "convex/values";
import {
  claimActivation,
  completeActivation,
} from "../../../../backend/convex/agent/activation";
import {
  deliverNotice,
  fund,
} from "../../../../backend/convex/agent/actions/compute";
import {
  settle,
  notice,
  sessionAllows,
} from "../../../../backend/convex/agent/compute";
import { debitCompute } from "../../../../backend/convex/agent/computeDebit";
import { observeNoticeBalance } from "../../../../backend/convex/agent/noticeBalance";
import { billingRequest } from "../../../../disposabl-kit/server/billing";
import {
  queue as actualQueue,
  queueForEligibleOwner,
} from "../../../../backend/convex/product/lowCreditEmail";

export const seed = mutation({
  args: { paidUntil: v.number(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert(
      "users",
      args.email ? { profile: { email: args.email } } : {},
    );
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
    });
    const debitId = await ctx.db.insert("computeDebits", {
      sessionId,
      state: "dispatching",
      paidUntil: args.paidUntil,
    });
    await ctx.db.patch(sessionId, { debitId });
    return { userId, sessionId, debitId };
  },
});
export const settleDebit = mutation({
  args: {
    debitId: v.id("computeDebits"),
    responseBalance: v.optional(v.number()),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
  },
  handler: (ctx, args) => (settle as any)._handler(ctx, args),
});
export const notify = mutation({
  args: {
    debitId: v.id("computeDebits"),
    failed: v.optional(v.boolean()),
    disabled: v.optional(v.boolean()),
    observation: v.optional(
      v.object({
        userId: v.id("users"),
        paidUntil: v.number(),
        balance: v.number(),
        observedAt: v.number(),
      }),
    ),
  },
  handler: (ctx, args) => (notice as any)._handler(ctx, args),
});
export const debit = query({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) => ctx.db.get(args.debitId),
});
export const emails = query({
  args: {},
  handler: (ctx) => ctx.db.query("fixtureEmails").take(100),
});
export const queueDirect = mutation({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: async (ctx, args) =>
    ctx.runMutation(
      makeFunctionReference("product/lowCreditEmail:queue") as any,
      args,
    ),
});

export const scheduled = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.system
      .query("_scheduled_functions")
      .order("desc")
      .take(101);
    if (jobs.length > 100)
      throw new Error("Fixture scheduled-job limit exceeded");
    return jobs;
  },
});

export const expire = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db.patch(args.debitId, { paidUntil: Date.now() - 1 }),
});

// Shorten a confirmed synthetic window to exercise its scheduled expiry promptly.
export const shortenWindow = mutation({
  args: { debitId: v.id("computeDebits"), paidUntil: v.number() },
  handler: async (ctx, { debitId, paidUntil }) => {
    const debit = await ctx.db.get(debitId);
    if (!debit || debit.state !== "confirmed" || paidUntil >= debit.paidUntil)
      throw new Error("Expected a confirmed window and earlier deadline");
    const session = await ctx.db.get(debit.sessionId);
    if (!session || session.state !== "active" || session.debitId !== debitId)
      throw new Error("Expected the current active session");
    await ctx.db.patch(debitId, { paidUntil });
    await ctx.db.patch(session._id, { paidUntil });
  },
});

export const actualProductQueue = mutation({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: (ctx, args) => (actualQueue as any)._handler(ctx, args),
});

export const deliver = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: (ctx, args) =>
    deliverNotice(ctx as any, args.debitId as any, args.attempt),
});

export const recordRead = mutation({
  args: {
    debitId: v.id("computeDebits"),
    method: v.string(),
    nonConsuming: v.boolean(),
  },
  handler: (ctx, args) => ctx.db.insert("fixtureReads", args),
});
export const reads = query({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db
      .query("fixtureReads")
      .withIndex("by_debit", (q) => q.eq("debitId", args.debitId))
      .take(20),
});
export const releaseRead = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db.insert("fixtureReads", {
      ...args,
      method: "release",
      nonConsuming: false,
    }),
});
export const readReleased = query({
  args: { debitId: v.id("computeDebits") },
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("fixtureReads")
        .withIndex("by_debit", (q) => q.eq("debitId", args.debitId))
        .take(20)
    ).some((entry) => entry.method === "release"),
});
export const deliverInitialReadFailure = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: (ctx, args) => {
    const wrapped = {
      ...ctx,
      runQuery: (ref: any, queryArgs: any) => {
        if (getFunctionName(ref) === "agent/compute:getDebit")
          throw new Error("injected initial read failure");
        return ctx.runQuery(ref, queryArgs);
      },
    };
    return deliverNotice(wrapped as any, args.debitId as any, args.attempt, {
      enabled: true,
      environment: "production",
      observe: async () => {
        throw new Error("unexpected observation");
      },
    });
  },
});
export const deliverInert = action({
  args: {
    debitId: v.id("computeDebits"),
    attempt: v.number(),
    balance: v.number(),
    mode: v.union(
      v.literal("ok"),
      v.literal("http-error"),
      v.literal("malformed"),
      v.literal("expire"),
      v.literal("hold"),
    ),
  },
  handler: (ctx, args) =>
    deliverNotice(ctx as any, args.debitId as any, args.attempt, {
      // Only this explicit fixture invocation bypasses the action gate; the
      // deployment remains E2E-disabled and its queue is an inert marker.
      enabled: true,
      environment: "production",
      observe: (userId) =>
        observeNoticeBalance(userId, "fixture", (key, method, body) =>
          billingRequest(key, method, body, async (_url, init) => {
            const request = JSON.parse(String(init?.body));
            await ctx.runMutation(
              makeFunctionReference("fixture:recordRead") as any,
              {
                debitId: args.debitId,
                method,
                nonConsuming: request.send_event === false,
              },
            );
            if (args.mode === "hold") {
              let released = false;
              for (let i = 0; i < 100 && !released; i++) {
                released = await ctx.runQuery(
                  makeFunctionReference("fixture:readReleased") as any,
                  { debitId: args.debitId },
                );
                if (!released)
                  await new Promise((resolve) => setTimeout(resolve, 30));
              }
              if (!released)
                throw new Error("fixture observation barrier timed out");
            }
            if (args.mode === "expire")
              await ctx.runMutation(
                makeFunctionReference("fixture:expire") as any,
                { debitId: args.debitId },
              );
            if (args.mode === "http-error")
              return new Response("unavailable", { status: 503 });
            return new Response(
              JSON.stringify(
                args.mode === "malformed"
                  ? {}
                  : {
                      customer_id: userId,
                      required_balance: 10,
                      allowed: args.balance >= 10,
                      balance: {
                        feature_id: "credits",
                        unlimited: false,
                        overage_allowed: false,
                        remaining: args.balance,
                      },
                    },
              ),
              { status: 200 },
            );
          }),
        ),
    }),
});

export const seedUnclaimed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.db.insert("users", {
      profile: { email: "verified@example.invalid" },
    });
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
      activation: "fresh",
    });
    await ctx.db.insert("apps", {
      appId: sessionId,
      name: "fixture",
      platforms: ["web"],
      userId,
      agent: {
        threadId: sessionId,
        computeSessionId: sessionId,
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return { userId, sessionId };
  },
});
// Model a successful inert sandbox activation before testing renewal.
export const activateFixture = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: async (ctx, { sessionId }) => {
    const args = { sessionId, token: "synthetic-activation" };
    if ((await claimActivation(ctx as any, args as any)) !== "claimed")
      throw new Error("Fixture activation was not claimed");
    if (!(await completeActivation(ctx as any, args as any)))
      throw new Error("Fixture activation did not complete");
  },
});
export const session = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, args) => ctx.db.get(args.sessionId),
});
export const allowed = query({
  args: { sessionId: v.id("computeSessions"), userId: v.string() },
  handler: (ctx, args) =>
    sessionAllows(
      ctx as any,
      args.sessionId as any,
      args.userId,
      Date.now(),
      true,
    ),
});
export const recordDebitRequest = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    method: v.string(),
    sendEvent: v.boolean(),
  },
  handler: (ctx, args) => ctx.db.insert("fixtureDebits", args),
});
export const debitRequests = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, args) =>
    ctx.db
      .query("fixtureDebits")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .take(20),
});
export const sessionDebits = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, args) =>
    ctx.db
      .query("computeDebits")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(20),
});
export const fundFixture = action({
  args: {
    sessionId: v.id("computeSessions"),
    responseBalance: v.number(),
    expectedDebit: v.optional(v.id("computeDebits")),
    allowed: v.optional(v.boolean()),
    mode: v.optional(v.union(v.literal("malformed"), v.literal("lost"))),
  },
  handler: (ctx, args) =>
    fund(
      ctx as any,
      args.sessionId as any,
      args.expectedDebit as any,
      async (userId) =>
        debitCompute(userId, true, "fixture", (key, method, body) =>
          billingRequest(key, method, body, async (_url, init) => {
            const request = JSON.parse(String(init?.body));
            await ctx.runMutation(
              makeFunctionReference("fixture:recordDebitRequest") as any,
              {
                sessionId: args.sessionId,
                method,
                sendEvent: request.send_event === true,
              },
            );
            if (args.mode === "lost")
              throw new Error("synthetic lost response");
            return new Response(
              JSON.stringify({
                customer_id: userId,
                required_balance: 10,
                allowed: args.allowed ?? true,
                balance:
                  args.mode === "malformed"
                    ? {}
                    : {
                        feature_id: "credits",
                        unlimited: false,
                        overage_allowed: false,
                        remaining: args.responseBalance,
                      },
              }),
              { status: 200 },
            );
          }),
        ),
    ),
});

// Synthetic marker only: the real email gate remains enabled in the deployment.
export const enqueueInert = mutation({
  args: { userId: v.id("users"), key: v.string() },
  handler: (ctx, { userId, key }) =>
    queueForEligibleOwner(ctx as any, userId, async () => {
      await ctx.db.insert("fixtureEmails", {
        key,
        to: "inert",
        text: "no email",
      });
      return "queued" as const;
    }),
});
export const requestDeletion = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.patch(userId, { deletionRequestedAt: Date.now() }),
});
export const removeSyntheticUser = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.delete(userId),
});

// This uses the same paid enqueue boundary as the provider-inert agent fixture.
import { enqueueMessageHandler } from "../../../../backend/convex/agent/internal";
import {
  readThread,
  patchThread,
} from "../../../../backend/convex/agent/threads";
import { stopping, stopped } from "../../../../backend/convex/agent/compute";

export const manualSeed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.db.insert("users", {
      profile: { email: "verified@example.invalid" },
    });
    const appId = crypto.randomUUID();
    const thread = await ctx.runMutation(
      componentsGeneric().agent.threads.createThread,
      { userId, title: "Synthetic manual resume" },
    );
    await ctx.db.insert("apps", {
      appId,
      userId,
      name: "fixture",
      platforms: ["web"],
      features: [],
      agent: {
        threadId: thread._id,
        status: "idle",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return { userId, appId, threadId: thread._id };
  },
});
export const manualEnqueue = mutation({
  args: { userId: v.string(), appId: v.string(), prompt: v.string() },
  handler: (ctx, args) =>
    enqueueMessageHandler(ctx as any, args, () => true, true),
});
export const manualApp = query({
  args: { appId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", args.appId))
      .unique(),
});
import {
  claim as realWorkerClaim,
  finish as realWorkerFinish,
} from "../../../../backend/convex/agent/state";
import { listMessages } from "@convex-dev/agent";

export const manualClaim = mutation({
  args: { id: v.string(), token: v.string() },
  handler: (ctx, args) =>
    (realWorkerClaim as any)._handler(ctx, { ...args, activationProtocol: 1 }),
});
export const manualFinish = mutation({
  args: {
    id: v.string(),
    token: v.string(),
    suspended: v.optional(v.boolean()),
    stopped: v.optional(v.boolean()),
  },
  handler: (ctx, args) => (realWorkerFinish as any)._handler(ctx, args),
});
export const manualSetRemote = mutation({
  args: { appId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", args.appId))
      .unique();
    const thread = readThread(app as any);
    if (!thread || thread.userId !== args.userId || !thread.lease)
      throw new Error("Expected owned leased thread");
    await patchThread(ctx as any, thread, {
      conversationId: "synthetic-conversation",
      promptId: "synthetic-prompt",
      cursor: "synthetic-cursor",
    });
  },
});
// Isolate each rebind guard on an already stopped synthetic session.
export const manualGuard = mutation({
  args: {
    appId: v.string(),
    userId: v.string(),
    kind: v.union(
      v.literal("clear"),
      v.literal("lease"),
      v.literal("pending"),
      v.literal("processing"),
      v.literal("delivery"),
    ),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q) => q.eq("appId", args.appId))
      .unique();
    const thread = readThread(app as any);
    if (!thread || thread.userId !== args.userId)
      throw new Error("Fixture ownership mismatch");
    const watchdog =
      args.kind === "lease"
        ? await ctx.scheduler.runAfter(
            600_000,
            makeFunctionReference("agent/actions/run:tick") as any,
            { id: thread.threadId },
          )
        : undefined;
    await patchThread(ctx as any, thread, {
      status: args.kind === "processing" ? "processing" : "idle",
      pending: args.kind === "pending" ? ["synthetic-pending"] : [],
      delivery:
        args.kind === "delivery" ? "synthetic-uncertain-delivery" : undefined,
      lease: watchdog
        ? {
            token: "guard-lease",
            watchdog,
            expiresAt: Date.now() + 600_000,
            activationProtocol: 1,
          }
        : undefined,
    });
  },
});
export const manualMessages = query({
  args: { threadId: v.string() },
  handler: (ctx, args) =>
    listMessages(ctx as any, componentsGeneric().agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 100, cursor: null },
    }),
});
export const manualSessions = query({
  args: { userId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(20),
});
export const manualStopClaim = mutation({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, args) => (stopping as any)._handler(ctx, args),
});
export const manualStopComplete = mutation({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, args) =>
    (stopped as any)._handler(ctx, { ...args, archived: true }),
});
