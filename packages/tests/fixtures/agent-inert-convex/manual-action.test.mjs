import { test, expect, mock } from "bun:test";
import { getFunctionName } from "convex/server";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { assertOwnedSdkBackend } from "../../helpers/sdk-auth/ownership";

assertOwnedSdkBackend({
  markerVariable: "AGENT_OWNERSHIP_FILE",
  ports: [3540, 3541],
  claimDirectory: ".manual-action-claimed",
});
const agent = (path) =>
  resolve(
    process.env.AGENT_FIXTURE_SOURCE,
    "packages/backend/convex/agent",
    path,
  );
const calls = { create: 0, resume: 0, dispatch: 0, other: 0 };
const forbidden = (name) => async () => {
  calls[name]++;
  throw Error(`unexpected ${name}`);
};
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
}));
mock.module(agent("boat.ts"), () => ({
  BoatError: class BoatError extends Error {},
  sandboxRef: (userId) => ({ ownerId: userId, key: "workspace" }),
  boat: {
    create: forbidden("create"),
    resume: forbidden("resume"),
    prompt: forbidden("dispatch"),
    refresh: forbidden("other"),
    promptStatus: forbidden("other"),
    stop: forbidden("other"),
  },
  object: (value) => value ?? {},
  request: forbidden("dispatch"),
  instructions: () => "",
}));
mock.module(agent("bootstrap.ts"), () => ({
  agentEnvironment: () => ({}),
  authorizeSandbox: forbidden("other"),
  credentialInstructions: () => "",
}));
mock.module(agent("events.ts"), () => ({ syncResponses: forbidden("other") }));
mock.module(agent("attachments.ts"), () => ({
  attachmentPrompt: forbidden("other"),
}));
mock.module(agent("computeDebit.ts"), () => ({
  debitCompute: forbidden("other"),
}));
mock.module(agent("noticeBalance.ts"), () => ({
  observeNoticeBalance: forbidden("other"),
}));
const { tick } = await import(agent("actions/run.ts"));
async function call(name, args) {
  const response = await fetch("http://127.0.0.1:3540/api/function", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${process.env.E2E_CONVEX_ADMIN_KEY}`,
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
    prompt: "synthetic first message",
  });
  const initial = await call("paidInspect", { userId, appId });
  const sessionId = initial.sessions[0]._id;
  const debit = await call("paidClaim", { sessionId });
  await call("paidConfirm", { debitId: debit._id });
  expect(await call("activationClaim", { sessionId, token: "initial" })).toBe(
    "claimed",
  );
  expect(
    await call("activationComplete", { sessionId, token: "initial" }),
  ).toBe(true);
  return { userId, appId, id, sessionId, debitId: debit._id };
}
function heldTick(f) {
  let token, release, arrived;
  const sessionReads = [];
  const held = new Promise((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ctx = {
    runMutation: async (ref, args) => {
      const name = getFunctionName(ref);
      if (name === "agent/state:claim") {
        expect(args.activationProtocol).toBe(1);
        const result = await call("paidWorkerClaim", args);
        expect(result.result?.computeSessionId).toBe(f.sessionId);
        token = args.token;
        return result.result;
      }
      if (name === "agent/state:finish") return call("manualFinish", args);
      throw Error(`unexpected mutation ${name}`);
    },
    runQuery: async (ref, args) => {
      let name;
      try {
        name = getFunctionName(ref);
      } catch {
        name = "boat";
      }
      if (name === "boat") {
        arrived();
        await gate;
        return null;
      }
      if (name === "apps/internal:get")
        return { name: "synthetic", platforms: ["web"] };
      if (name === "users/internal:deletionPending") return false;
      if (name === "agent/compute:workBlocked")
        return call("manualWorkBlocked", { userId: f.userId });
      if (name === "agent/compute:get") {
        sessionReads.push(args.sessionId);
        return (await call("manualSession", { sessionId: args.sessionId }))
          .session;
      }
      throw Error(`unexpected query ${name}`);
    },
  };
  const action = tick._handler(ctx, { id: f.id });
  return { action, held, release, token: () => token, sessionReads };
}
async function denyRenewal(f) {
  await call("manualRemote", { userId: f.userId, appId: f.appId });
  await call("manualExpireWindow", { debitId: f.debitId });
  const debit = await call("paidClaim", {
    sessionId: f.sessionId,
    expectedDebit: f.debitId,
  });
  expect(debit?.state).toBe("dispatching");
  await call("manualDeny", { debitId: debit._id });
  const result = await call("manualSession", { sessionId: f.sessionId });
  expect(result.session.state).toBe("stopping");
  expect(result.session.debitId).toBe(debit._id);
  expect(result.debits.find((row) => row._id === debit._id).state).toBe(
    "denied",
  );
  return debit._id;
}
async function sharedStop(f) {
  const args = { sessionId: f.sessionId, token: "synthetic-archive" };
  expect(await call("activationStop", args)).toBe(true);
  await call("activationStopComplete", args);
  expect(
    (await call("manualSession", { sessionId: f.sessionId })).session.state,
  ).toBe("stopped");
}
async function finishStale(action) {
  await expect(action).rejects.toThrow("Agent worker lease expired");
  expect(calls).toEqual({ create: 0, resume: 0, dispatch: 0, other: 0 });
}

test("denial and suspended finish preserve unresolved fencing against the retained tick", async () => {
  const f = await setup(),
    worker = heldTick(f);
  await worker.held;
  const deniedId = await denyRenewal(f);
  await call("manualFinish", {
    id: f.id,
    token: worker.token(),
    suspended: true,
  });
  const app = (await call("paidInspect", { userId: f.userId, appId: f.appId }))
    .app.agent;
  expect(app.stopUnconfirmed).toBe(true);
  expect(app.promptId).toBe("synthetic-prompt");
  expect(app.conversationId).toBe("synthetic-conversation");
  expect(app.lease).toBeUndefined();
  await sharedStop(f);
  await expect(
    call("paidEnqueue", {
      userId: f.userId,
      appId: f.appId,
      prompt: "must be rejected",
    }),
  ).rejects.toThrow(/confirmed stopped|could not be stopped/);
  const before = await call("manualSession", { sessionId: f.sessionId });
  worker.release();
  await finishStale(worker.action);
  const after = await call("manualSession", { sessionId: f.sessionId });
  expect(after.session.debitId).toBe(deniedId);
  expect(after.debits.map((x) => x._id).sort()).toEqual(
    before.debits.map((x) => x._id).sort(),
  );
  expect(after.debits.map((x) => x._id).sort()).toEqual(
    [f.debitId, deniedId].sort(),
  );
});

test("confirmed synthetic stops and a new admission do not let the retained tick use the new session", async () => {
  const f = await setup(),
    worker = heldTick(f);
  await worker.held;
  const deniedId = await denyRenewal(f);
  await call("manualFinish", {
    id: f.id,
    token: worker.token(),
    stopped: true,
  });
  const stopped = (
    await call("paidInspect", { userId: f.userId, appId: f.appId })
  ).app.agent;
  expect(stopped.lease).toBeUndefined();
  expect(stopped.promptId).toBeUndefined();
  expect(stopped.turnCompleted).toBe(true);
  await sharedStop(f);
  await call("paidEnqueue", {
    userId: f.userId,
    appId: f.appId,
    prompt: "explicit new message",
  });
  const rebound = (
    await call("paidInspect", { userId: f.userId, appId: f.appId })
  ).app.agent;
  const newSession = rebound.computeSessionId;
  expect(newSession).not.toBe(f.sessionId);
  const newDebit = await call("paidClaim", { sessionId: newSession });
  await call("paidConfirm", { debitId: newDebit._id });
  expect(
    await call("activationClaim", { sessionId: newSession, token: "new" }),
  ).toBe("claimed");
  expect(
    await call("activationComplete", { sessionId: newSession, token: "new" }),
  ).toBe(true);
  const oldBefore = await call("manualSession", { sessionId: f.sessionId });
  const newBefore = await call("manualSession", { sessionId: newSession });
  worker.release();
  await finishStale(worker.action);
  const oldAfter = await call("manualSession", { sessionId: f.sessionId });
  const newAfter = await call("manualSession", { sessionId: newSession });
  expect(oldAfter.session.debitId).toBe(deniedId);
  expect(oldAfter.debits.map((x) => x._id).sort()).toEqual(
    [f.debitId, deniedId].sort(),
  );
  expect(oldAfter.debits.map((x) => x._id).sort()).toEqual(
    oldBefore.debits.map((x) => x._id).sort(),
  );
  expect(newAfter.session.debitId).toBe(newDebit._id);
  expect(newAfter.debits.map((x) => x._id)).toEqual([newDebit._id]);
  expect(newAfter.debits.map((x) => x._id)).toEqual(
    newBefore.debits.map((x) => x._id),
  );
  expect(worker.sessionReads).toEqual([f.sessionId]);
  expect(
    (await call("paidInspect", { userId: f.userId, appId: f.appId })).app.agent
      .computeSessionId,
  ).toBe(newSession);
});
