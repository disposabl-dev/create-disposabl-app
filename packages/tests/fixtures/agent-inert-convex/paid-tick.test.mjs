import { test, expect, mock } from "bun:test";
import { getFunctionName } from "convex/server";
import { resolve } from "node:path";

// Isolated subprocess: no network and no provider credentials or real adapters.
const paths = (s) =>
  resolve(import.meta.dir, "../../../backend/convex/agent", s);
let state;
globalThis.fetch = async () => {
  state.calls.network++;
  throw new Error("unexpected network");
};
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
}));
mock.module(paths("computeDebit.ts"), () => ({
  debitCompute: async () => {
    state.calls.debit++;
    throw new Error("unexpected debit");
  },
}));
mock.module(paths("boat.ts"), () => ({
  boat: {
    create: async () => {
      state.calls.create++;
      return { sandboxId: "synthetic", state: "ready" };
    },
    refresh: async () => {
      state.calls.refresh++;
      await Promise.resolve();
      if (state.changeAt === "refresh") state.change();
      return {
        sandboxId: "synthetic",
        state: state.archived ? "archived" : "ready",
      };
    },
    resume: async () => {
      state.calls.resume++;
      await Promise.resolve();
      if (state.changeAt === "resume") state.change();
      return { sandboxId: "synthetic", state: "ready" };
    },
    prompt: async () => {
      state.calls.prompt++;
      return { promptId: "prompt", conversationId: "conversation" };
    },
    promptStatus: async () => {
      state.calls.promptStatus++;
      return { done: true };
    },
  },
  BoatError: class BoatError extends Error {},
  sandboxRef: (userId) => ({ ownerId: userId, key: "workspace" }),
  object: (value) => value ?? {},
  request: async () => {
    state.calls.request++;
    throw new Error("unexpected provider request");
  },
  instructions: () => "",
}));
mock.module(paths("bootstrap.ts"), () => ({
  authorizeSandbox: async () => {
    state.calls.authorize++;
    await Promise.resolve();
    if (state.changeAt === "authorize") state.change();
  },
  agentEnvironment: () => ({}),
  credentialInstructions: () => "",
}));
mock.module(paths("events.ts"), () => ({
  syncResponses: async () => ({ more: false, mutable: false }),
}));
mock.module(paths("attachments.ts"), () => ({
  attachmentPrompt: async () => "",
}));
const { tick } = await import(paths("actions/run.ts"));

function make({
  sessionState = "active",
  paidUntil = Date.now() + 60_000,
  pending = false,
  sandbox = true,
  archived = false,
  changeAt,
  changeKind,
} = {}) {
  state = {
    session: { userId: "owner", state: sessionState, paidUntil },
    pending,
    sandbox,
    archived,
    changeAt,
    calls: {
      create: 0,
      refresh: 0,
      resume: 0,
      prompt: 0,
      promptStatus: 0,
      request: 0,
      authorize: 0,
      debit: 0,
      network: 0,
    },
    finishes: [],
    checks: 0,
    change() {
      if (changeKind === "expiry") this.session.paidUntil = Date.now() - 1;
      else this.pending = true;
    },
  };
  const ctx = {
    runQuery: async (ref) => {
      let name;
      try {
        name = getFunctionName(ref);
      } catch {
        name = "boat.get";
      }
      if (name === "boat.get")
        return state.sandbox
          ? { sandboxId: "synthetic", state: "ready" }
          : null;
      if (name === "users/internal:deletionPending") {
        state.checks++;
        return state.pending;
      }
      if (name === "agent/compute:get") return state.session;
      if (name === "apps/internal:get")
        return { name: "fixture", platforms: ["web"] };
      throw new Error(`unexpected query ${name}`);
    },
    runMutation: async (ref, args) => {
      const name = getFunctionName(ref);
      if (name === "agent/state:claim")
        return {
          id: "thread",
          userId: "owner",
          appId: "app",
          computeSessionId: "session",
          status: "processing",
        };
      if (name === "agent/state:next")
        return { prompt: "synthetic", messageId: "message", fileIds: [] };
      if (name === "agent/state:delivered") return false;
      if (name === "agent/state:finish") {
        state.finishes.push(args);
        return null;
      }
      throw new Error(`unexpected mutation ${name}`);
    },
  };
  return { run: () => tick._handler(ctx, { id: "thread" }), state };
}
function verifyNoExternal(s) {
  expect(s.calls.network).toBe(0);
  expect(s.calls.debit).toBe(0);
  expect(s.calls.request).toBe(0);
  expect(s.finishes.some((x) => x.error)).toBe(false);
}

test("blocked, expired, held and deletion-pending work cannot create, resume or prompt", async () => {
  for (const options of [
    { sessionState: "hold" },
    { paidUntil: Date.now() - 1 },
    { pending: true },
    { sessionState: "stopped" },
  ]) {
    for (const sandbox of [false, true]) {
      const f = make({ ...options, sandbox, archived: true });
      await f.run();
      expect(f.state.checks).toBeGreaterThan(0);
      expect(f.state.calls.create).toBe(0);
      expect(f.state.calls.refresh).toBe(0);
      expect(f.state.calls.resume).toBe(0);
      expect(f.state.calls.prompt).toBe(0);
      expect(f.state.finishes).toHaveLength(1);
      verifyNoExternal(f.state);
    }
  }
});

test("expiry or deletion during refresh or resume fences the next dispatch", async () => {
  for (const changeAt of ["refresh", "resume"])
    for (const changeKind of ["expiry", "deletion"]) {
      const f = make({
        sandbox: true,
        archived: changeAt === "resume",
        changeAt,
        changeKind,
      });
      await f.run();
      expect(f.state.calls.refresh).toBe(1);
      expect(f.state.calls.resume).toBe(changeAt === "resume" ? 1 : 0);
      expect(f.state.calls.prompt).toBe(0);
      expect(f.state.calls.authorize).toBe(0);
      expect(f.state.finishes).toHaveLength(1);
      verifyNoExternal(f.state);
    }
});

test("expiry or deletion during authorization prevents prompt delivery", async () => {
  for (const changeKind of ["expiry", "deletion"]) {
    const f = make({ sandbox: true, changeAt: "authorize", changeKind });
    await f.run();
    expect(f.state.calls.authorize).toBe(1);
    expect(f.state.calls.prompt).toBe(0);
    expect(f.state.finishes).toHaveLength(1);
    verifyNoExternal(f.state);
  }
});

test("active paid work reaches create, resume and prompt through real access checks", async () => {
  for (const options of [
    { sandbox: false },
    { sandbox: true, archived: true },
  ]) {
    const f = make(options);
    await f.run();
    expect(f.state.calls.create).toBe(options.sandbox ? 0 : 1);
    expect(f.state.calls.resume).toBe(options.archived ? 1 : 0);
    expect(f.state.calls.prompt).toBe(1);
    expect(f.state.calls.authorize).toBe(1);
    expect(f.state.checks).toBeGreaterThanOrEqual(4);
    verifyNoExternal(f.state);
  }
});
