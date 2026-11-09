import { test, expect, mock } from "bun:test";
import { getFunctionName } from "convex/server";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { assertOwnedSdkBackend } from "../../helpers/sdk-auth/ownership";

assertOwnedSdkBackend({
  markerVariable: "AGENT_OWNERSHIP_FILE",
  ports: [3540, 3541],
  claimDirectory: ".legacy-action-claimed",
});
const root = process.env.AGENT_FIXTURE_SOURCE;
const agent = (path) => resolve(root, "packages/backend/convex/agent", path);
const runtime = resolve(import.meta.dir, "runtime");
const counts = { create: 0, resume: 0, other: 0 };
const denied = () => {
  counts.other++;
  throw Error("unexpected provider operation");
};
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
}));
mock.module(agent("boat.ts"), () => ({
  BoatError: class BoatError extends Error {},
  sandboxRef: (userId) => ({ ownerId: userId, key: "workspace" }),
  boat: {
    create: async () => {
      counts.create++;
      return { state: "creating" };
    },
    resume: denied,
    refresh: denied,
    prompt: denied,
    promptStatus: denied,
    stop: denied,
  },
  object: (x) => x || {},
  request: denied,
  instructions: () => "",
}));
mock.module(agent("bootstrap.ts"), () => ({
  agentEnvironment: () => ({}),
  authorizeSandbox: denied,
  credentialInstructions: () => "",
}));
mock.module(agent("events.ts"), () => ({ syncResponses: denied }));
mock.module(agent("attachments.ts"), () => ({ attachmentPrompt: denied }));
mock.module(agent("computeDebit.ts"), () => ({ debitCompute: denied }));
mock.module(agent("noticeBalance.ts"), () => ({
  observeNoticeBalance: denied,
}));
const { tick } = await import(resolve(runtime, "oldRun.ts"));
const { computeAccess } = await import(resolve(runtime, "oldCompute.ts"));
expect(typeof computeAccess).toBe("function");
const key = process.env.E2E_CONVEX_ADMIN_KEY;
async function call(name, args) {
  if (name === "paidInspect") args = { userId: args.userId, appId: args.appId };
  const response = await fetch("http://127.0.0.1:3540/api/function", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${key}`,
    },
    body: JSON.stringify({
      path: `agentFixture:${name}`,
      args,
      format: "json",
    }),
  });
  const result = await response.json();
  if (result.status !== "success") throw Error(result.errorMessage);
  return result.value;
}
async function setup() {
  const userId = await call("paidUser", {}),
    appId = randomUUID();
  const id = await call("paidApp", { userId, appId });
  await call("paidEnqueue", {
    userId,
    appId,
    prompt: "synthetic legacy action",
  });
  const snapshot = await call("paidInspect", { userId, appId });
  const sessionId = snapshot.sessions[0]._id;
  const debit = await call("paidClaim", { sessionId });
  await call("paidConfirm", { debitId: debit._id });
  return { userId, appId, id, sessionId };
}
function context(f, claimMode) {
  let release, acquired;
  const paused = new Promise((resolve) => {
    acquired = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ctx = {
    runMutation: async (ref, args) => {
      const name = getFunctionName(ref);
      if (name === "agent/state:claim") {
        expect(args.activationProtocol).toBeUndefined();
        if (claimMode === "current") {
          const result = await call("paidWorkerClaim", args);
          expect(result.scheduled).toEqual(["agent/actions/run:tick"]);
          expect(result.result).toBeNull();
          return result.result;
        }
        const result = await call("legacyClaim", args);
        expect(result?.lease?.token).toBe(args.token);
        expect(result.lease.activationProtocol).toBeUndefined();
        acquired();
        await gate;
        return result;
      }
      if (name === "agent/state:finish") return call("legacyFinish", args);
      throw Error(`unexpected mutation ${name}`);
    },
    runQuery: async (ref) => {
      let name;
      try {
        name = getFunctionName(ref);
      } catch {
        name = "boat";
      }
      if (name === "boat") return null;
      if (name === "apps/internal:get")
        return { name: "synthetic", platforms: ["web"] };
      if (
        name === "users/internal:deletionPending" ||
        name === "agent/compute:workBlocked"
      )
        return false;
      if (name === "agent/compute:get")
        return (await call("paidInspect", f)).sessions[0];
      throw Error(`unexpected query ${name}`);
    },
  };
  return { ctx, paused, release };
}

test("retained old tick fences activation until it drains", async () => {
  const f = await setup();
  const c = context(f, "legacy");
  const action = tick._handler(c.ctx, { id: f.id });
  await c.paused;
  const before = await call("paidInspect", f);
  expect(before.app.agent.lease.activationProtocol).toBeUndefined();
  expect(counts.create + counts.resume).toBe(0);
  expect(
    await call("activationClaim", { sessionId: f.sessionId, token: "first" }),
  ).toBe("wait");
  c.release();
  await action;
  expect(counts.create).toBe(1);
  expect((await call("paidInspect", f)).app.agent.lease).toBeUndefined();
  const claims = await Promise.all(
    ["a", "b"].map((token) =>
      call("activationClaim", { sessionId: f.sessionId, token }),
    ),
  );
  expect(claims.sort()).toEqual(["claimed", "wait"]);
});

test("shared stop waits for retained old tick and old post-deploy tick hands off", async () => {
  const f = await setup();
  const c = context(f, "legacy");
  const action = tick._handler(c.ctx, { id: f.id });
  await c.paused;
  expect(await call("activationArchive", { sessionId: f.sessionId })).toBe(
    true,
  );
  expect(
    await call("activationStop", { sessionId: f.sessionId, token: "stop" }),
  ).toBe(false);
  const createBefore = counts.create;
  c.release();
  await action;
  expect(counts.create).toBe(createBefore);
  expect(
    await call("activationStop", { sessionId: f.sessionId, token: "stop" }),
  ).toBe(true);
  const later = await setup();
  const next = context(later, "current");
  await tick._handler(next.ctx, { id: later.id });
  expect((await call("paidInspect", later)).app.agent.lease).toBeUndefined();
  expect(counts.create).toBe(createBefore);
  expect(counts.resume + counts.other).toBe(0);
});
