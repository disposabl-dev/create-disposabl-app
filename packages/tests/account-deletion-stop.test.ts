import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { boat } from "../backend/convex/agent/boat";
import { stopForDeletion } from "../backend/convex/agent/actions/compute";
import { credential } from "../backend/convex/connections/actions/credentials";

test("stop stage only confirms an archived provider response", async () => {
  const originalRefresh = boat.refresh,
    originalStop = boat.stop;
  try {
    for (const mode of ["archived", "pending", "error", "missing"] as const) {
      let outcome: string | undefined;
      boat.refresh = async () => ({ state: "running" }) as any;
      boat.stop = async () => {
        if (mode === "error") throw new Error("fixture failure");
        return { state: mode === "archived" ? "archived" : "stopping" } as any;
      };
      const ctx = {
        runQuery: async () =>
          mode === "missing" ? null : { sandboxId: "fixture" },
        runMutation: async (ref: any, args: any) => {
          if (getFunctionName(ref).endsWith(":claimDeletionStop")) return true;
          outcome = args.outcome;
          return true;
        },
      };
      await (stopForDeletion as any)._handler(ctx, { userId: "fixture" });
      assert.equal(
        outcome,
        mode === "archived" ? "archived_observed" : "unknown",
      );
    }
  } finally {
    boat.refresh = originalRefresh;
    boat.stop = originalStop;
  }
});

test("pending account cannot retrieve connected provider credentials", async () => {
  let calls = 0;
  await assert.rejects(
    credential(
      {
        runQuery: async () => {
          calls++;
          return true;
        },
      } as any,
      "owner",
      "convex",
    ),
    /Account deletion has been requested/,
  );
  assert.equal(calls, 1);
});

test("REST authentication rejects a pending owner while allowing another", async () => {
  const { agentApiPolicy } = await import("../backend/convex/agent/api_policy");
  const request = new Request("https://example.test/api/apps/get", {
    headers: { Authorization: "Bearer normal-token" },
  });
  const user = { userId: "owner", scopes: [], connectionId: "session" };
  const fallback = async () => user;
  assert.equal(
    await agentApiPolicy.authenticate(
      { runQuery: async () => true } as any,
      request,
      fallback as any,
    ),
    null,
  );
  assert.deepEqual(
    await agentApiPolicy.authenticate(
      { runQuery: async () => false } as any,
      request,
      fallback as any,
    ),
    user,
  );
});
