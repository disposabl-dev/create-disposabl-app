import { saveMessage } from "@convex-dev/agent";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { v, type Infer } from "convex/values";
import { components, internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { getThread, patchThread } from "./threads";
import { event, thread, workerArgs } from "./validator";

async function locked(ctx: MutationCtx, args: { id: string; token: string }) {
  const current = await getThread(ctx, args.id);
  if (!current || current.lease?.token !== args.token)
    throw new Error("Agent worker lease expired.");
  return current;
}

export const claim = internalMutation({
  args: workerArgs,
  returns: v.union(thread, v.null()),
  handler: async (ctx, { id, token }): Promise<Infer<typeof thread> | null> => {
    const current = await getThread(ctx, id);
    if (!current || (current.lease && current.lease.expiresAt > Date.now()))
      return null;
    if (
      !current.pending.length &&
      !["processing", "stopping"].includes(current.status)
    )
      return null;
    // A hard timeout may leave a Boat POST accepted without its response saved.
    // Stop that run rather than delivering the same prompt twice.
    const watchdog = await ctx.scheduler.runAfter(
      11 * 60_000,
      internal.agent.actions.run.tick,
      { id },
    );
    const patch = {
      lease: { token, expiresAt: Date.now() + 11 * 60_000, watchdog },
      ...(current.delivery
        ? {
            status: "stopping" as const,
            error:
              "Message delivery could not be confirmed. The remote run was stopped; resend your message.",
          }
        : {}),
    };
    await patchThread(ctx, current, patch);
    return { ...current, ...patch };
  },
});

export const next = internalMutation({
  args: workerArgs,
  returns: v.union(
    v.null(),
    v.object({ messageId: v.string(), prompt: v.string() }),
  ),
  handler: async (ctx, args) => {
    const current = await locked(ctx, args);
    const messageId = current.pending[0];
    if (current.status === "stopping" || !messageId) return null;
    const [message] = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      { messageIds: [messageId] },
    );
    if (!message?.text) throw new Error("Saved user message is missing.");
    await patchThread(ctx, current, { delivery: messageId });
    return { messageId, prompt: message.text };
  },
});

export const delivered = internalMutation({
  args: {
    ...workerArgs,
    messageId: v.string(),
    promptId: v.string(),
    conversationId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await locked(ctx, args);
    await patchThread(ctx, current, {
      promptId: args.promptId,
      conversationId: args.conversationId,
      delivery: undefined,
      pending: current.pending.filter((id) => id !== args.messageId),
      updatedAt: Date.now(),
    });
    return current.status === "stopping";
  },
});

export const attachConversation = internalMutation({
  args: { ...workerArgs, conversationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await locked(ctx, args);
    await patchThread(ctx, current, {
      conversationId: args.conversationId,
      delivery: undefined,
    });
    return null;
  },
});

export const append = internalMutation({
  args: {
    ...workerArgs,
    events: v.array(event),
    cursor: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await locked(ctx, args);
    let mutable = false;
    for (const e of args.events) {
      let existing = await ctx.db
        .query("agentEvents")
        .withIndex("by_threadId_eventId", (q) =>
          q.eq("threadId", args.id).eq("eventId", e.id),
        )
        .unique();
      // Boat can replace a transient response ID when it commits the final
      // event. Reuse that turn's pending message, or its identical final text.
      if (!existing && e.taskId && e.content && !e.tools) {
        const candidates = await ctx.db
          .query("agentEvents")
          .withIndex("by_threadId_taskId", (q) =>
            q.eq("threadId", args.id).eq("taskId", e.taskId),
          )
          .order("desc")
          .take(20);
        for (const candidate of candidates) {
          if (candidate.tools || candidate.closed) continue;
          const [message] = await ctx.runQuery(
            components.agent.messages.getMessagesByIds,
            { messageIds: [candidate.messageId] },
          );
          if (candidate.streaming || message?.text === e.content) {
            existing = candidate;
            await ctx.db.patch("agentEvents", candidate._id, { eventId: e.id });
            break;
          }
        }
      }
      if (existing?.closed) continue;
      mutable ||= e.streaming && !e.reverted;
      const content = e.reverted ? "" : e.content;
      const status = e.reverted
        ? "failed"
        : e.streaming
          ? "pending"
          : "success";
      if (existing) {
        const [message] = await ctx.runQuery(
          components.agent.messages.getMessagesByIds,
          { messageIds: [existing.messageId] },
        );
        if (message?.text !== content || message.status !== status)
          await ctx.runMutation(components.agent.messages.updateMessage, {
            messageId: existing.messageId,
            patch: { message: { role: "assistant", content }, status },
          });
        if (existing.streaming !== e.streaming || existing.tools !== e.tools)
          await ctx.db.patch("agentEvents", existing._id, {
            streaming: e.streaming,
            tools: e.tools,
          });
      } else if (!e.reverted && (content || e.tools)) {
        const { messageId } = await saveMessage(ctx, components.agent, {
          threadId: current.threadId,
          userId: current.userId,
          agentName: "Disposabl",
          message: { role: "assistant", content },
          metadata: { status, provider: "codex" },
        });
        await ctx.db.insert("agentEvents", {
          threadId: args.id,
          eventId: e.id,
          messageId,
          streaming: e.streaming,
          taskId: e.taskId,
          tools: e.tools,
        });
      }
    }
    if (args.cursor !== undefined && !mutable)
      await patchThread(ctx, current, { cursor: args.cursor });
    return mutable;
  },
});

export const finish = internalMutation({
  args: {
    ...workerArgs,
    done: v.optional(v.boolean()),
    stopped: v.optional(v.boolean()),
    unconfirmed: v.optional(v.boolean()),
    error: v.optional(v.string()),
    delay: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await locked(ctx, args);
    await ctx.scheduler.cancel(current.lease!.watchdog);
    let status = current.status;
    let pending = current.pending;
    const error = args.error ?? current.error;
    if (args.unconfirmed) {
      status = "failed";
      pending = [];
    } else if (args.error) {
      // Interrupt even when a timed-out POST did not return a prompt ID.
      status = "stopping";
      if (current.status === "stopping" && (current.stopFailures ?? 0) >= 4)
        status = "failed";
      for (const messageId of pending)
        await ctx.runMutation(components.agent.messages.updateMessage, {
          messageId,
          patch: { status: "failed", error: args.error },
        });
      pending = [];
    } else if (args.stopped) {
      status = error ? "failed" : "idle";
      for (const messageId of pending)
        await ctx.runMutation(components.agent.messages.updateMessage, {
          messageId,
          patch: {
            status: "failed",
            error: error ?? "Stopped before delivery.",
          },
        });
      pending = [];
    } else if (args.done && current.status !== "stopping" && !pending.length)
      status = error ? "failed" : "idle";
    if (args.stopped || args.done) {
      const outputs = await ctx.db
        .query("agentEvents")
        .withIndex("by_threadId_streaming", (q) =>
          q.eq("threadId", args.id).eq("streaming", true),
        )
        .take(100);
      for (const output of outputs) {
        await ctx.runMutation(components.agent.messages.updateMessage, {
          messageId: output.messageId,
          patch: {
            status: args.stopped || error ? "failed" : "success",
            ...(error
              ? { error }
              : args.stopped
                ? { error: "Agent stopped." }
                : {}),
          },
        });
        await ctx.db.patch("agentEvents", output._id, {
          streaming: false,
          closed: Boolean(args.stopped || error),
        });
      }
    }
    await patchThread(ctx, current, {
      status,
      pending,
      ...(status !== "processing" ? { access: undefined } : {}),
      error: args.unconfirmed
        ? "Boat delivery could not be confirmed. Retry abortMessage to reconcile this app's conversation; other apps were not interrupted."
        : error,
      lease: undefined,
      delivery: args.stopped
        ? undefined
        : args.error || args.unconfirmed
          ? current.delivery
          : undefined,
      stopFailures: args.stopped
        ? undefined
        : args.error
          ? (current.stopFailures ?? 0) + 1
          : current.stopFailures,
      stopUnconfirmed: args.stopped
        ? undefined
        : args.unconfirmed || (status === "failed" && args.error)
          ? true
          : current.stopUnconfirmed,
      ...(args.stopped ? { promptId: undefined } : {}),
      updatedAt: Date.now(),
    });
    if (pending.length || status === "processing" || status === "stopping")
      await ctx.scheduler.runAfter(
        args.delay ?? 1000,
        internal.agent.actions.run.tick,
        { id: args.id },
      );
    return null;
  },
});
