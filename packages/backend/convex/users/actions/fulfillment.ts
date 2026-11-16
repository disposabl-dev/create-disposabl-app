import { v } from "convex/values";
import { anyApi } from "convex/server";
import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { components, internal } from "../../_generated/api";
import { env } from "../../_generated/server";

/** DELETE is idempotent for the captured provider ID; 404 confirms it is gone. */
export async function deleteSandbox(
  sandboxId: string,
  key: string,
  transport = fetch,
) {
  if (!key.trim()) throw new Error("Boat credentials are missing.");
  const response = await transport(
    `https://boat.dev/api/v1/sandboxes/${encodeURIComponent(sandboxId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${key}`,
        "X-Ascii-Confirm-Delete": sandboxId,
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return;
  if (!response.ok)
    throw new Error(`Boat deletion failed (${response.status}).`);
  const body = await response.text();
  if (body) {
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      throw new Error("Boat deletion returned an invalid response.");
    }
    if (
      !result ||
      typeof result !== "object" ||
      (result as { ok?: unknown }).ok === false
    )
      throw new Error("Boat deletion was not confirmed.");
  }
}

export const advance = internalAction({
  args: {
    userId: v.id("users"),
    expectedRequestedAt: v.number(),
    reference: v.string(),
  },
  returns: v.object({
    state: v.union(
      v.literal("advanced"),
      v.literal("blocked"),
      v.literal("completed"),
    ),
    detail: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    state: "advanced" | "blocked" | "completed";
    detail: string;
  }> => {
    if (
      await ctx.runQuery(anyApi.users.fulfillment.completedReceipt, {
        reference: args.reference,
        expectedRequestedAt: args.expectedRequestedAt,
      })
    )
      return { state: "completed", detail: "Account deletion completed." };
    if (!(await ctx.runQuery(anyApi.users.fulfillment.requestMatches, args)))
      return {
        state: "blocked",
        detail: "Deletion request and receipt do not match.",
      };
    const identity = {
      userId: args.userId,
      expectedRequestedAt: args.expectedRequestedAt,
    };
    const prepared = await ctx.runMutation(
      anyApi.users.fulfillment.prepare,
      identity,
    );
    if (prepared.state === "blocked")
      return {
        state: "blocked",
        detail: prepared.reason ?? "Sandbox is unverified.",
      };
    if (prepared.state === "known" && prepared.sandboxId) {
      await deleteSandbox(prepared.sandboxId, env.BOAT_API_KEY);
      const record = await ctx.runQuery(components.boat.sandboxes.get, {
        ownerId: args.userId,
        key: "workspace",
      });
      if (record && record.sandboxId !== prepared.sandboxId)
        return { state: "blocked", detail: "Sandbox identity changed." };
      if (record)
        await ctx.runAction(components.boat.lifecycle.destroy, {
          ownerId: args.userId,
          key: "workspace",
        });
      await ctx.runMutation(anyApi.users.fulfillment.markSandboxDeleted, {
        ...identity,
        sandboxId: prepared.sandboxId,
      });
      return { state: "advanced", detail: "Managed sandbox deleted." };
    }
    const app = await ctx.runMutation(anyApi.users.fulfillment.app, identity);
    if (app) {
      if (app.threadId)
        await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
          threadId: app.threadId,
        });
      await ctx.runMutation(anyApi.users.fulfillment.eraseAppBatch, {
        ...identity,
        ...app,
      });
      return {
        state: "advanced",
        detail: "App cleanup advanced; external projects were retained.",
      };
    }
    const local = await ctx.runMutation(
      internal.users.localDeletion.advanceLocalBatch,
      identity,
    );
    if (local.outcome === "blocked")
      return { state: "blocked", detail: local.blockers.join(" ") };
    if (local.outcome !== "local_stages_cleared")
      return {
        state: "advanced",
        detail: `Local ${local.stage} cleanup advanced.`,
      };
    if (
      !(await ctx.runMutation(
        anyApi.users.fulfillment.clearConnections,
        identity,
      ))
    )
      return { state: "advanced", detail: "Connection cleanup advanced." };
    await ctx.runMutation(anyApi.users.fulfillment.complete, args);
    return { state: "completed", detail: "Account deletion completed." };
  },
});

/** Run one bounded stage. Uncertain failures are held for an operator. */
export const automate = internalAction({
  args: {
    userId: v.id("users"),
    expectedRequestedAt: v.number(),
    reference: v.string(),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!(await ctx.runMutation(anyApi.users.automation.claim, args)))
      return null;
    const { token: _token, ...request } = args;
    try {
      const result: {
        state: "advanced" | "blocked" | "completed";
        detail: string;
      } = await ctx.runAction(
        anyApi.users.actions.fulfillment.advance,
        request,
      );
      if (result.state !== "completed")
        await ctx.runMutation(anyApi.users.automation.finish, {
          ...args,
          outcome: result.state,
          detail: result.detail,
        });
    } catch {
      await ctx.runMutation(anyApi.users.automation.finish, {
        ...args,
        outcome: "failed",
        detail: "",
      });
    }
    return null;
  },
});
