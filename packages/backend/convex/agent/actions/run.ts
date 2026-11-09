import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { v, type Infer } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { components, internal } from "../../_generated/api";
import { env } from "../../_generated/server";
import {
  boat,
  BoatError,
  instructions,
  object,
  request,
  sandboxRef,
} from "../boat";
import { thread } from "../validator";
import { syncResponses } from "../events";
import { attachmentPrompt } from "../attachments";
import { computeAccess } from "./compute";
import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import {
  agentEnvironment,
  authorizeSandbox,
  credentialInstructions,
} from "../bootstrap";

export const tick = internalAction({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const lease = { id, token: crypto.randomUUID() };
    const current: Infer<typeof thread> | null = await ctx.runMutation(
      internal.agent.state.claim,
      lease,
    );
    if (!current) return null;
    const ref = sandboxRef(current.userId);
    const canWork = async () => {
      const access = await computeAccess(
        ctx,
        current.userId,
        current.computeSessionId,
      );
      if (access === "ready") return true;
      await ctx.runMutation(internal.agent.state.finish, {
        ...lease,
        ...(access === "blocked" ? { suspended: true } : { delay: 2000 }),
      });
      return false;
    };
    let phase = "sandbox-status";
    try {
      let sandbox = await ctx.runQuery(components.boat.sandboxes.get, ref);
      if (current.status === "stopping") {
        if (paymentsEnabled) {
          const session =
            current.computeSessionId &&
            (await ctx.runQuery(internal.agent.compute.get, {
              sessionId: current.computeSessionId,
            }));
          // Keep an abort pending while boundary funding is unresolved. A later
          // confirmed renewal must not abandon the remote conversation's stop.
          if (
            session?.state === "renewing" ||
            (session?.state === "active" && session.paidUntil <= Date.now())
          ) {
            await ctx.runMutation(internal.agent.state.finish, {
              ...lease,
              delay: 2000,
            });
            return null;
          }
          if (
            !session ||
            session.state !== "active" ||
            session.paidUntil <= Date.now()
          ) {
            await ctx.runMutation(internal.agent.state.finish, {
              ...lease,
              suspended: true,
            });
            return null;
          }
        }
        phase = "stop";
        // Confirm the conversation stopped before accepting more work.
        if (sandbox?.sandboxId) {
          phase = "stop-refresh";
          sandbox = await boat.refresh(ctx, ref);
          if (["ready", "idle", "running"].includes(sandbox.state)) {
            const conversations = async () => {
              phase = "stop-conversations";
              const data = await request(
                sandbox!.sandboxId!,
                "/conversations",
                undefined,
                "GET",
              );
              if (!Array.isArray(data.conversations))
                throw new Error("Boat conversation status is unavailable.");
              return data.conversations.map(object);
            };
            if (!current.conversationId && current.delivery) {
              const match = (await conversations()).find(
                (c) =>
                  typeof c.lastPromptPreview === "string" &&
                  c.lastPromptPreview.startsWith(
                    `Disposabl delivery ${current.delivery}\n`,
                  ),
              );
              if (typeof match?.id !== "string") {
                await ctx.runMutation(internal.agent.state.finish, {
                  ...lease,
                  unconfirmed: true,
                });
                return null;
              }
              current.conversationId = match.id;
              await ctx.runMutation(internal.agent.state.attachConversation, {
                ...lease,
                conversationId: match.id,
              });
            }
            if (current.conversationId) {
              try {
                phase = "stop-interrupt";
                await request(
                  sandbox.sandboxId!,
                  `/interrupt?conversation=${encodeURIComponent(current.conversationId)}`,
                );
              } catch (error) {
                if (
                  !(error instanceof BoatError) ||
                  error.code !== "no_running_turn"
                )
                  throw error;
              }
              const remote = (await conversations()).find(
                (c) => c.id === current.conversationId,
              );
              if (!remote || typeof remote.running !== "boolean")
                throw new Error(
                  "Boat did not confirm the conversation stopped.",
                );
              phase = "stop-sync-responses";
              const { more } = await syncResponses(ctx, current, lease);
              if (remote.running || more) {
                await ctx.runMutation(internal.agent.state.finish, {
                  ...lease,
                  delay: more ? 0 : 1000,
                });
                return null;
              }
            }
          } else if (!["archived", "deleted"].includes(sandbox.state)) {
            throw new Error("Boat sandbox status is unavailable.");
          }
        }
        await ctx.runMutation(internal.agent.state.finish, {
          ...lease,
          stopped: true,
        });
        return null;
      }
      const app = await ctx.runQuery(internal.apps.internal.get, {
        userId: current.userId,
        appId: current.appId,
      });
      if (!(await canWork())) return null;
      if (!sandbox?.sandboxId)
        sandbox = await boat.create(ctx, {
          ...ref,
          options: {
            type: "default",
            ttlSeconds: paymentsEnabled ? 600 : 900,
            env: agentEnvironment(),
            // The configured environment supplies the operator's Codex OAuth account.
            ...(env.BOAT_AGENT_ENVIRONMENT
              ? { environment: env.BOAT_AGENT_ENVIRONMENT }
              : { noEnv: true }),
          },
        });
      else sandbox = await boat.refresh(ctx, ref);
      if (!(await canWork())) return null;
      if (sandbox.state === "archived") {
        try {
          sandbox = await boat.resume(ctx, {
            ...ref,
            options: {
              ttlSeconds: paymentsEnabled ? 600 : 900,
              env: agentEnvironment(),
              ...(env.BOAT_AGENT_ENVIRONMENT
                ? { environment: env.BOAT_AGENT_ENVIRONMENT }
                : { noEnv: true }),
            },
          });
        } catch (error) {
          // A timed-out resume may have succeeded remotely.
          sandbox = await boat.refresh(ctx, ref);
          if (
            ![
              "ready",
              "idle",
              "running",
              "creating",
              "init",
              "provisioning",
              "provisioned",
              "cloning",
            ].includes(sandbox.state)
          )
            throw error;
        }
      }
      if (!(await canWork())) return null;
      if (["error", "deleted", "degraded"].includes(sandbox.state))
        throw new Error(
          "Agent sandbox is unavailable. Check its Boat configuration before retrying.",
        );
      if (
        !["ready", "idle", "running"].includes(sandbox.state) ||
        !sandbox.sandboxId
      ) {
        await ctx.runMutation(internal.agent.state.finish, {
          ...lease,
          delay: 2000,
        });
        return null;
      }
      let promptId = current.promptId;
      let conversationId = current.conversationId;
      phase = "prompt-status";
      let run = promptId
        ? object(await boat.promptStatus(ctx, { ...ref, promptId }))
        : undefined;
      phase = "next-message";
      const queued = await ctx.runMutation(internal.agent.state.next, lease);
      if (queued) {
        let prompt = queued.prompt;
        try {
          prompt += await attachmentPrompt(ctx, current.userId, queued.fileIds);
        } catch {
          await ctx.runMutation(
            makeFunctionReference<
              "mutation",
              { id: string; token: string; messageId: string },
              null
            >("agent/attachments:reject"),
            { ...lease, messageId: queued.messageId },
          );
          await ctx.runMutation(internal.agent.state.finish, {
            ...lease,
            delay: 0,
            done: !promptId || run?.done === true,
          });
          return null;
        }
        let sent:
          { promptId: string; conversationId: string | null } | undefined;
        if (run && !run.done && conversationId) {
          phase = "steer";
          if (!(await canWork())) return null;
          try {
            const steered = await request(sandbox.sandboxId, "/steer", {
              conversation: conversationId,
              message: prompt,
            });
            if (typeof steered.promptId !== "string")
              throw new Error("Boat did not confirm message delivery.");
            // A native steer's promptId is a completed delivery receipt, not
            // the running turn. Keep polling the original run until it ends.
            sent = {
              promptId: steered.native === true ? promptId! : steered.promptId,
              conversationId,
            };
          } catch (error) {
            if (
              !(error instanceof BoatError) ||
              error.code !== "no_running_turn"
            )
              throw error;
            if (error.reason !== "turn_ended" && error.reason !== "no_turn") {
              if (error.reason !== "turn_not_started") throw error;
              await ctx.runMutation(internal.agent.state.finish, {
                ...lease,
                delay: 1000,
              });
              return null;
            }
          }
        }
        if (!sent) {
          phase = "authorize-sandbox";
          await authorizeSandbox(ctx, current, lease);
          phase = "send-prompt";
          if (!(await canWork())) return null;
          sent = await boat.prompt(ctx, {
            ...ref,
            provider: "codex",
            prompt:
              `Disposabl delivery ${queued.messageId}\n` +
              credentialInstructions(current.appId) +
              (conversationId ? "" : instructions(current.appId, app)) +
              prompt,
            ...(conversationId
              ? { conversationId }
              : { newConversation: true }),
          });
        }
        if (!sent.conversationId)
          throw new Error("Boat did not return a conversation ID.");
        promptId = sent.promptId;
        conversationId = sent.conversationId;
        const stopping = await ctx.runMutation(internal.agent.state.delivered, {
          ...lease,
          messageId: queued.messageId,
          promptId,
          conversationId,
        });
        if (!(await canWork())) return null;
        if (stopping) {
          await request(
            sandbox.sandboxId,
            `/interrupt?conversation=${encodeURIComponent(conversationId)}`,
          );
          await ctx.runMutation(internal.agent.state.finish, {
            ...lease,
            delay: 0,
          });
          return null;
        }
        run = object(await boat.promptStatus(ctx, { ...ref, promptId }));
      }
      phase = "sync-responses";
      const { more, mutable } = await syncResponses(
        ctx,
        { ...current, conversationId },
        lease,
      );
      if (more) {
        await ctx.runMutation(internal.agent.state.finish, {
          ...lease,
          delay: 0,
        });
        return null;
      }
      const failed = run?.status === "failed";
      await ctx.runMutation(internal.agent.state.finish, {
        ...lease,
        done: run?.done === true && !mutable,
        ...(failed
          ? {
              error:
                "The Codex run failed. Check the Boat model credentials and retry.",
            }
          : {}),
      });
    } catch (error) {
      console.error("agent_worker_failure", {
        phase,
        kind: error instanceof Error ? error.name : "unknown",
        ...(error instanceof Error
          ? {
              frames: error.stack
                ?.split("\n")
                .filter((line) => /^\s+at /.test(line))
                .slice(0, 4),
            }
          : {}),
        ...(error instanceof BoatError
          ? { status: error.status, code: error.code }
          : {}),
      });
      // No provider payloads or credentials enter client-visible errors.
      const message =
        error instanceof BoatError && error.code === "provider_not_configured"
          ? "Codex credentials are not configured for this Boat environment."
          : "The remote agent could not continue. Check the Boat sandbox and model configuration, then retry.";
      await ctx.runMutation(internal.agent.state.finish, {
        ...lease,
        error: message,
        delay: 5000,
      });
    }
    return null;
  },
});
