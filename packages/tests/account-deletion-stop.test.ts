import { upload } from "../backend/convex/files/index";
import { requireFileWrite } from "../backend/convex/files/guard";
import { save } from "../backend/convex/connections/internal";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { boat } from "../backend/convex/agent/boat";
import { stopForDeletion } from "../backend/convex/agent/actions/compute";
import { credential } from "../backend/convex/connections/actions/credentials";
import {
  claimDeletionStop,
  finishDeletionStop,
  deletionRequests,
} from "../backend/convex/users/internal";

test("expired stop is reported unknown and one explicit retry replaces its lease", async () => {
  let user: any = {
    _id: "owner",
    deletionRequestedAt: 1,
    deletionStop: {
      state: "running",
      token: "old",
      attempt: 1,
      updatedAt: 1,
      leaseUntil: 1,
    },
  };
  const ctx = {
    db: {
      get: async () => user,
      patch: async (_table: string, _id: string, patch: object) => {
        user = { ...user, ...patch };
      },
      query: () => ({
        withIndex: () => ({
          paginate: async () => ({
            page: [user],
            isDone: true,
            continueCursor: "",
          }),
        }),
      }),
    },
  };
  const queue = () =>
    (deletionRequests as any)._handler(ctx, {
      paginationOpts: { numItems: 10, cursor: null },
    });
  assert.equal((await queue()).page[0].stop, "unknown");
  const claim = (token: string) =>
    (claimDeletionStop as any)._handler(ctx, { userId: "owner", token });
  assert.equal(await claim("new"), true);
  assert.equal(user.deletionStop.attempt, 2);
  assert.equal((await queue()).page[0].stop, "running");
  assert.equal(await claim("duplicate"), false);
  const finish = (token: string) =>
    (finishDeletionStop as any)._handler(ctx, {
      userId: "owner",
      token,
      outcome: "archived_observed",
    });
  assert.equal(await finish("old"), false);
  assert.equal(await finish("new"), true);
  assert.equal((await queue()).page[0].stop, "archived_observed");
});

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

test("upload compensates when deletion wins before registration", async () => {
  let deleted = 0,
    inserted = 0;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "session" }) },
    runQuery: async (_ref: unknown, args: any) =>
      "sessionId" in args ? { userId: "owner" } : false,
    storage: {
      store: async () => "fixture-object",
      delete: async () => {
        deleted++;
      },
    },
    runMutation: async () => {
      inserted++;
      throw new Error("Account deletion has been requested");
    },
  };
  await assert.rejects(
    (upload as any)._handler(ctx, {
      filename: "a.txt",
      mediaType: "text/plain",
      bytes: new TextEncoder().encode("a").buffer,
    }),
    /Account deletion/,
  );
  assert.equal(inserted, 1);
  assert.equal(deleted, 1);
});

test("missing owner is fenced before connection or file writes", async () => {
  let writes = 0;
  const ctx = {
    db: {
      normalizeId: () => null,
      get: async () => null,
      query: () => {
        writes++;
        throw new Error("unexpected query");
      },
    },
  };
  await assert.rejects(
    requireFileWrite(ctx as any, "invalid"),
    /account no longer exists/,
  );
  await assert.rejects(
    (save as any)._handler(ctx, {
      userId: "invalid",
      provider: "convex",
      token: "fixture",
      name: "fixture",
      accountId: "fixture",
    }),
    /account no longer exists/,
  );
  assert.equal(writes, 0);
});

test("late OAuth callback stops before provider exchange when state consumption is fenced", async () => {
  const { complete } =
    await import("../backend/convex/connections/actions/oauth");
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("unexpected provider request");
  };
  try {
    await assert.rejects(
      (complete as any)._handler(
        {
          runMutation: async () => {
            throw new Error("Account deletion has been requested");
          },
        },
        {
          userId: "owner",
          provider: "convex",
          code: "fixture",
          state: "fixture",
        },
      ),
      /Account deletion/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("auth cleanup stays blocked without proven remote drain", async () => {
  const { runBatch } = await import("../backend/convex/users/authDeletion");
  let user: any = {
    deletionRequestedAt: 123,
    deletionStop: { state: "archived_observed" },
    mcpDeletion: { state: "attributed_complete" },
  };
  let writes = 0;
  const ctx = {
    db: {
      get: async (_table: string, id: string) => (id === "owner" ? user : null),
      patch: async (_table: string, _id: string, patch: object) => {
        writes++;
        user = { ...user, ...patch };
      },
    },
    runMutation: () => {
      throw new Error("must not touch auth components");
    },
  };
  const call = (userId: string, expectedRequestedAt: number) =>
    (runBatch as any)._handler(ctx, { userId, expectedRequestedAt });
  await assert.rejects(() => call("other", 123), /Matching deletion request/);
  await assert.rejects(() => call("owner", 124), /Matching deletion request/);
  const result = await call("owner", 123);
  assert.equal(result.blocker, "remote_work_drain_unverified");
  assert.deepEqual(await call("owner", 123), result);
  assert.equal(writes, 1);
});
