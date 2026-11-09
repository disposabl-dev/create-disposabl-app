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
    const canWork = async (allowActivation = false) => {
      const access = await computeAccess(
        ctx,
        current.userId,
        current.computeSessionId,
        allowActivation,
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
        // Interrupting existing work does not admit or resume paid work.
        // A lost funding result must not prevent the user from requesting a stop.
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
              // An idle observation cannot exclude acceptance of an earlier
              // timed-out request. Keep that delivery for provider reconciliation.
              if (current.delivery) {
                await ctx.runMutation(internal.agent.state.finish, {
                  ...lease,
                  unconfirmed: true,
                });
                return null;
              }
            } else if (current.promptId || current.stopUnconfirmed) {
              await ctx.runMutation(internal.agent.state.finish, {
                ...lease,
                unconfirmed: true,
              });
              return null;
            }
          } else if (sandbox.state === "archived") {
            // An archived machine may retain its running programs for warm resume.
            if (
              current.promptId ||
              (current.conversationId && !current.turnCompleted) ||
              current.delivery ||
              current.stopUnconfirmed
            ) {
              await ctx.runMutation(internal.agent.state.finish, {
                ...lease,
                unconfirmed: true,
              });
              return null;
            }
          } else if (sandbox.state !== "deleted")
            throw new Error("Boat sandbox status is unavailable.");
        } else if (
          current.promptId ||
          (current.conversationId && !current.turnCompleted) ||
          current.delivery ||
          current.stopUnconfirmed
        ) {
          await ctx.runMutation(internal.agent.state.finish, {
            ...lease,
            unconfirmed: true,
          });
          return null;
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
      if (!(await canWork(true))) return null;
      let activationClaimed = false;
      const activation = current.computeSessionId
        ? { sessionId: current.computeSessionId, token: lease.token }
        : undefined;
      if (paymentsEnabled) {
        if (!activation) throw new Error("Paid sandbox session is missing.");
        const decision = await ctx.runMutation(
          internal.agent.activation.claim,
          activation,
        );
        if (decision === "wait" || decision === "blocked") {
          await ctx.runMutation(internal.agent.state.finish, {
            ...lease,
            ...(decision === "wait" ? { delay: 2000 } : { suspended: true }),
          });
          return null;
        }
        activationClaimed = decision === "claimed";
      }
      const closeArchived = async () => {
        await ctx.runMutation(internal.agent.activation.archived, {
          sessionId: activation!.sessionId,
        });
        await ctx.runMutation(internal.agent.state.finish, {
          ...lease,
          suspended: true,
        });
      };
      try {
        if (!(await canWork(true))) {
          if (activationClaimed)
            await ctx.runMutation(
              internal.agent.activation.uncertain,
              activation!,
            );
          return null;
        }
        if (!sandbox?.sandboxId) {
          if (paymentsEnabled && !activationClaimed) {
            await closeArchived();
            return null;
          }
          sandbox = await boat.create(ctx, {
            ...ref,
            options: {
              type: "default",
              ttlSeconds: paymentsEnabled ? 600 : 900,
              env: agentEnvironment(),
              ...(env.BOAT_AGENT_ENVIRONMENT
                ? { environment: env.BOAT_AGENT_ENVIRONMENT }
                : { noEnv: true }),
            },
          });
        } else sandbox = await boat.refresh(ctx, ref);
        if (sandbox.state === "archived") {
          if (paymentsEnabled && !activationClaimed) {
            await closeArchived();
            return null;
          }
          if (!(await canWork(true))) {
            if (activationClaimed)
              await ctx.runMutation(
                internal.agent.activation.uncertain,
                activation!,
              );
            return null;
          }
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
            // Paid activation keeps its action fence after an ambiguous response.
            if (paymentsEnabled) throw error;
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
        if (activationClaimed) {
          if (
            !sandbox.sandboxId ||
            ![
              "ready",
              "idle",
              "running",
              "creating",
              "init",
              "provisioning",
              "provisioned",
              "cloning",
            ].includes(sandbox.state) ||
            !(await ctx.runMutation(
              internal.agent.activation.complete,
              activation!,
            ))
          ) {
            await ctx.runMutation(
              internal.agent.activation.uncertain,
              activation!,
            );
            await ctx.runMutation(internal.agent.state.finish, {
              ...lease,
              suspended: true,
            });
            return null;
          }
          activationClaimed = false;
        }
      } catch (error) {
        if (activationClaimed)
          await ctx.runMutation(
            internal.agent.activation.uncertain,
            activation!,
          );
        throw error;
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
