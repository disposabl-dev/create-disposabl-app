import { listMessages, saveMessage } from "@convex-dev/agent";
import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { components, internal } from "../_generated/api";
import { env } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ownedApp } from "../apps/internal";
import { assertActive } from "../apps/operations/internal";
import { history, historyArgs, result, sendArgs } from "./validator";
import { requireConnections } from "../connections/config";
import { readThread, patchThread } from "./threads";
import { resolvePlatforms } from "@disposabl/disposabl-kit/platforms";
import { resolveFeatures } from "@disposabl/disposabl-kit/feature-options";

export const sendMessage = internalMutation({
  platforms: true,
  args: { ...identityFields, ...sendArgs },
  returns: result,
  handler: async (
    ctx,
    { userId, appId, prompt, platforms, features },
  ): Promise<Infer<typeof result>> => {
    prompt = prompt.trim();
    if (!prompt || prompt.length > 32_000)
      throw new ConvexError("Prompt must contain 1–32,000 characters.");
    if (!env.BOAT_API_KEY)
      throw new ConvexError("Remote agents are not configured.");
    let app: Doc<"apps">;
    if (appId) {
      if (platforms !== undefined || features !== undefined)
        throw new ConvexError(
          "Use the app configuration action to change an existing app's platforms or features.",
        );
      app = await ownedApp(ctx, userId, appId);
      assertActive(app);
    } else {
      const selectedPlatforms = resolvePlatforms(platforms ?? ["web"]);
      const selectedFeatures = resolveFeatures(features ?? ["authentication"]);
      requireConnections(
        await ctx.runQuery(internal.connections.internal.status, {
          userId,
          features: selectedFeatures,
        }),
        selectedPlatforms,
      );
      appId = crypto.randomUUID();
      const id = await ctx.db.insert("apps", {
        appId,
        userId,
        name: prompt.slice(0, 80),
        platforms: selectedPlatforms,
        features: selectedFeatures,
        expoAccountId: null,
      });
      app = (await ctx.db.get("apps", id))!;
    }
    let current = readThread(app);
    if (!current) {
      const stored = await ctx.runMutation(
        components.agent.threads.createThread,
        {
          userId,
          title: prompt.slice(0, 80),
        },
      );
      current = {
        appId,
        userId,
        threadId: stored._id,
        status: "idle",
        pending: [],
        updatedAt: Date.now(),
      };
    }
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
    await patchThread(ctx, current, {
      pending: [...current.pending, messageId],
      status: "processing",
      ...(current.status !== "processing" ? { access: undefined } : {}),
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.agent.actions.run.tick, {
      id: current.threadId,
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
    const current = readThread(await ownedApp(ctx, userId, appId));
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
    await patchThread(ctx, current, {
      pending: [],
      status,
      access: undefined,
      stopFailures: undefined,
      error: undefined,
      updatedAt: Date.now(),
    });
    if (status === "stopping")
      await ctx.scheduler.runAfter(0, internal.agent.actions.run.tick, {
        id: current.threadId,
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
      const apps = await ctx.db
        .query("apps")
        .withIndex("by_userId_agentUpdatedAt", (q) =>
          q.eq("userId", userId).gt("agent.updatedAt", undefined),
        )
        .order("desc")
        .paginate(opts);
      return {
        kind: "threads",
        ...apps,
        page: apps.page.map((app) => ({
          appId: app.appId,
          threadId: app.agent!.threadId,
          status: app.agent!.status,
          updatedAt: app.agent!.updatedAt,
          error: app.agent!.error,
          name: app.name,
        })),
      };
    }
    const current = readThread(await ownedApp(ctx, userId, appId));
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
      stopUnconfirmed: current.stopUnconfirmed,
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
