import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { components, internal } from "../_generated/api";
import { env, type QueryCtx } from "../_generated/server";
import { ownedApp } from "../apps/internal";
import { assertActive } from "../apps/operations/internal";
import { history, historyArgs, result, sendArgs } from "./validator";

export async function findThread(ctx: Pick<QueryCtx, "db">, appId: string) {
  return ctx.db
    .query("agentThreads")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
}

export const sendMessage = internalMutation({
  platforms: true,
  args: { ...identityFields, ...sendArgs },
  returns: result,
  handler: async (
    ctx,
    { userId, appId, prompt },
  ): Promise<Infer<typeof result>> => {
    prompt = prompt.trim();
    if (!prompt || prompt.length > 32_000)
      throw new ConvexError("Prompt must contain 1–32,000 characters.");
    if (!env.BOAT_API_KEY)
      throw new ConvexError("Remote agents are not configured.");
    if (appId) assertActive(await ownedApp(ctx, userId, appId));
    else {
      appId = crypto.randomUUID();
      await ctx.db.insert("apps", {
        appId,
        userId,
        name: prompt.slice(0, 80),
        platforms: ["web"],
        features: ["authentication"],
        expoAccountId: null,
      });
    }
    let current = await findThread(ctx, appId);
    if (!current) {
      const threadId = await createThread(ctx, components.agent, {
        userId,
        title: prompt.slice(0, 80),
      });
      const id = await ctx.db.insert("agentThreads", {
        userId,
        appId,
        threadId,
        status: "idle",
        pending: [],
        updatedAt: Date.now(),
      });
      current = (await ctx.db.get("agentThreads", id))!;
    }
    if (current.userId !== userId) throw new ConvexError("App not found.");
    if (current.stopUnconfirmed)
      throw new ConvexError(
        "The previous remote run could not be stopped. Retry abortMessage before sending more work.",
      );
    if (current.status === "stopping")
      throw new ConvexError(
        "Wait for the agent to stop before sending another message.",
      );
    if (current.pending.length >= 32)
      throw new ConvexError(
        "Wait for the agent to receive your pending messages.",
      );
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: current.threadId,
      userId,
      prompt,
    });
    await ctx.db.patch("agentThreads", current._id, {
      pending: [...current.pending, messageId],
      status: "processing",
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.agent.actions.run.tick, {
      id: current._id,
    });
    return { appId, threadId: current.threadId, status: "processing" };
  },
});

export const abortMessage = internalMutation({
  platforms: true,
  args: { ...identityFields, appId: v.string() },
  returns: v.union(result, v.null()),
  handler: async (
    ctx,
    { userId, appId },
  ): Promise<Infer<typeof result> | null> => {
    await ownedApp(ctx, userId, appId);
    const current = await findThread(ctx, appId);
    if (!current) return null;
    for (const messageId of current.pending) {
      if (messageId !== current.delivery)
        await ctx.runMutation(components.agent.messages.updateMessage, {
          messageId,
          patch: { status: "failed", error: "Stopped before delivery." },
        });
    }
    const status =
      current.status === "idle" && !current.lease ? "idle" : "stopping";
    await ctx.db.patch("agentThreads", current._id, {
      pending: [],
      status,
      stopFailures: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });
    if (status === "stopping")
      await ctx.scheduler.runAfter(0, internal.agent.actions.run.tick, {
        id: current._id,
      });
    return { appId, threadId: current.threadId, status };
  },
});

export const getMessages = internalQuery({
  platforms: true,
  args: { ...identityFields, ...historyArgs },
  returns: history,
  handler: async (
    ctx,
    { userId, appId, paginationOpts },
  ): Promise<Infer<typeof history>> => {
    const opts = paginationOpts ?? { numItems: 20, cursor: null };
    if (
      !Number.isInteger(opts.numItems) ||
      opts.numItems < 1 ||
      opts.numItems > 100
    )
      throw new ConvexError("Page size must be between 1 and 100.");
    if (!appId) {
      const threads = await ctx.db
        .query("agentThreads")
        .withIndex("by_userId_updatedAt", (q) => q.eq("userId", userId))
        .order("desc")
        .paginate(opts);
      const page = await Promise.all(
        threads.page.map(async (t) => {
          const app = await ctx.db
            .query("apps")
            .withIndex("by_appId", (q) => q.eq("appId", t.appId))
            .unique();
          return app?.userId === userId
            ? {
                appId: t.appId,
                threadId: t.threadId,
                status: t.status,
                updatedAt: t.updatedAt,
                error: t.error,
                name: app.name,
              }
            : null;
        }),
      );
      return {
        kind: "threads",
        ...threads,
        page: page.filter((t) => t !== null),
      };
    }
    await ownedApp(ctx, userId, appId);
    const current = await findThread(ctx, appId);
    if (!current)
      return {
        kind: "messages",
        appId,
        threadId: "",
        status: "idle",
        page: [],
        isDone: true,
        continueCursor: "",
      };
    const messages = await listMessages(ctx, components.agent, {
      threadId: current.threadId,
      paginationOpts: opts,
    });
    return {
      kind: "messages",
      appId,
      threadId: current.threadId,
      status: current.status,
      error: current.error,
      ...messages,
      page: await Promise.all(
        messages.page.map(async (m) => ({
          id: m._id,
          role: m.message?.role ?? "assistant",
          content: m.text ?? "",
          status: m.status,
          createdAt: m._creationTime,
          tools: (
            await ctx.db
              .query("agentEvents")
              .withIndex("by_messageId", (q) => q.eq("messageId", m._id))
              .unique()
          )?.tools,
        })),
      ),
    };
  },
});
