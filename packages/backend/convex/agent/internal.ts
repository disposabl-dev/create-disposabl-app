import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { requireNotDeleting } from "../users/deletion";
import { listMessages, saveMessage } from "@convex-dev/agent";
import {
  identityFields,
  internalMutation,
  internalAction,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { components, internal } from "../_generated/api";
import { env } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { ownedApp } from "../apps/internal";
import { assertActive } from "../apps/operations/internal";
import { history, historyArgs, result, sendArgs } from "./validator";
import { requireConnections } from "../connections/config";
import {
  readThread,
  patchThread,
  assertSessionRebind,
  legacyCompleted,
} from "./threads";
import { resolvePlatforms } from "@disposabl/disposabl-kit/platforms";
import { resolveFeatures } from "@disposabl/disposabl-kit/feature-options";
import { ownedAttachments, attachmentReferences } from "./attachments";
import { requireCredits } from "./credits";
import { admitSession } from "./compute";

const enqueueArgs = v.object({ ...identityFields, ...sendArgs });

export async function enqueueMessageHandler(
  ctx: MutationCtx,
  {
    userId,
    appId,
    prompt,
    platforms,
    features,
    fileIds = [],
  }: Infer<typeof enqueueArgs>,
  remoteConfigured: () => boolean,
  paid = paymentsEnabled,
): Promise<Infer<typeof result>> {
  await requireNotDeleting(ctx, userId);
  prompt = prompt.trim();
  if (!prompt || prompt.length > 32_000)
    throw new ConvexError("Prompt must contain 1–32,000 characters.");
  if (!remoteConfigured())
    throw new ConvexError("Remote agents are not configured.");
  const attachments = await ownedAttachments(ctx, userId, fileIds);
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
      agentRemoteUnresolved: false,
      agentResumeBusy: false,
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
    message: {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...attachments.map((file) => ({
          type: "file" as const,
          data: {
            type: "reference" as const,
            reference: { disposablFile: file._id },
          },
          filename: file.filename,
          mediaType: file.mediaType,
        })),
      ],
    },
  });
  const computeSessionId = await admitSession(ctx, userId, paid);
  assertSessionRebind(current, computeSessionId);
  // Before turnCompleted existed, successful completion left the prompt ID on
  // an idle, finished thread. Confirmed aborts cleared it instead.
  const completed = legacyCompleted(current);
  await patchThread(ctx, current, {
    computeSessionId,
    ...(computeSessionId !== current.computeSessionId
      ? { promptId: undefined, delivery: undefined }
      : {}),
    ...(completed ? { promptId: undefined, turnCompleted: true } : {}),
    pending: [...current.pending, messageId],
    status: "processing",
    ...(current.status !== "processing"
      ? { access: undefined, startedAt: Date.now(), finishedAt: undefined }
      : {}),
    error: undefined,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.agent.actions.run.tick, {
    id: current.threadId,
  });
  return { appId, threadId: current.threadId, status: "processing" };
}

export const enqueueMessage = internalMutation({
  args: enqueueArgs.fields,
  returns: result,
  handler: (ctx, args) =>
    enqueueMessageHandler(ctx, args, () => Boolean(env.BOAT_API_KEY)),
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
      current.status === "idle" && !current.lease && !current.stopUnconfirmed
        ? "idle"
        : "stopping";
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
      startedAt: current.startedAt,
      finishedAt: current.finishedAt,
      status: current.status,
      error: current.error,
      stopUnconfirmed: current.stopUnconfirmed,
      ...messages,
      page: await Promise.all(
        messages.page.map(async (m) => ({
          id: m._id,
          role: m.message?.role ?? "assistant",
          content: m.text ?? "",
          attachments: attachmentReferences(m.message?.content),
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

/** All API and native entry points share this authenticated, provider-backed gate. */
export const sendMessage = internalAction({
  platforms: true,
  args: { ...identityFields, ...sendArgs },
  returns: result,
  handler: (ctx, args): Promise<Infer<typeof result>> =>
    guardedEnqueue(ctx, args),
});

export async function guardedEnqueue(
  ctx: ActionCtx,
  args: { userId: string } & Infer<
    ReturnType<typeof v.object<typeof sendArgs>>
  >,
  check = requireCredits,
): Promise<Infer<typeof result>> {
  if (args.appId)
    await ctx.runQuery(internal.apps.internal.get, {
      userId: args.userId,
      appId: args.appId,
    });
  if (
    await ctx.runQuery(internal.users.internal.deletionPending, {
      userId: args.userId,
    })
  )
    throw new ConvexError(
      "Account deletion has been requested. Contact support for assistance.",
    );
  await check(args.userId);
  return ctx.runMutation(internal.agent.internal.enqueueMessage, args);
}
