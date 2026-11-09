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
    stop: async () => {
      state.calls.stop++;
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
  request: async (_sandbox, path) => {
    state.calls.request++;
    if (!state.stopRequests) throw new Error("unexpected provider request");
    state.remotePaths.push(path);
    if (path.startsWith("/interrupt?")) return {};
    if (path === "/conversations")
      return {
        conversations: [
          {
            id: "conversation",
            running: false,
            lastPromptPreview:
              "Disposabl delivery uncertain-delivery\nsynthetic",
          },
        ],
      };
    throw new Error("unexpected stop request");
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
const { finish } = await import(paths("state.ts"));
const { settle, stopping, stopped } = await import(paths("compute.ts"));
const { stop } = await import(paths("actions/compute.ts"));

function make({
  sessionState = "active",
  paidUntil = Date.now() + 60_000,
  pending = false,
  sandbox = true,
  archived = false,
  changeAt,
  changeKind,
  status = "processing",
  stopRequests = false,
} = {}) {
  state = {
    session: {
      _id: "session",
      userId: "owner",
      state: sessionState,
      paidUntil,
      debitId: "debit",
    },
    debit: {
      _id: "debit",
      _creationTime: Date.now(),
      sessionId: "session",
      state: "dispatching",
      paidUntil: 0,
    },
    pending,
    sandbox,
    archived,
    changeAt,
    stopRequests,
    remotePaths: [],
    scheduled: [],
    app: {
      _id: "app-row",
      appId: "app",
      userId: "owner",
      agent: {
        threadId: "thread",
        computeSessionId: "session",
        status,
        pending: [],
        ...(stopRequests ? { delivery: "uncertain-delivery" } : {}),
      },
    },
    calls: {
      create: 0,
      refresh: 0,
      resume: 0,
      prompt: 0,
      promptStatus: 0,
      request: 0,
      stop: 0,
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
    db: {
      get: async (table, id) =>
        table === "computeSessions" && id === "session"
          ? state.session
          : table === "computeDebits" && id === "debit"
            ? state.debit
            : null,
      query: (table) => {
        const chain = {
          withIndex: () => chain,
          unique: async () => (table === "apps" ? state.app : null),
          order: () => chain,
          first: async () =>
            table === "computeSessions" ? state.session : null,
          take: async () => [],
        };
        return chain;
      },
      patch: async (table, _id, patch) =>
        Object.assign(
          table === "computeSessions"
            ? state.session
            : table === "computeDebits"
              ? state.debit
              : state.app,
          patch,
        ),
    },
    scheduler: {
      cancel: async () => {},
      runAfter: async (delay, ref, args) =>
        state.scheduled.push({ delay, name: getFunctionName(ref), args }),
      runAt: async (when, ref, args) =>
        state.scheduled.push({ when, name: getFunctionName(ref), args }),
    },
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
      if (name === "agent/state:claim") {
        state.app.agent.lease = {
          token: args.token,
          expiresAt: Date.now() + 60_000,
          watchdog: "watchdog",
        };
        return { ...state.app.agent, userId: "owner", appId: "app" };
      }
      if (name === "agent/state:attachConversation") {
        state.app.agent.conversationId = args.conversationId;
        return null;
      }
      if (name === "agent/state:next")
        return { prompt: "synthetic", messageId: "message", fileIds: [] };
      if (name === "agent/state:delivered") return false;
      if (name === "agent/state:finish") {
        state.finishes.push(args);
        return finish._handler(ctx, args);
      }
      if (name === "agent/compute:stopping")
        return stopping._handler(ctx, args);
      if (name === "agent/compute:stopped") return stopped._handler(ctx, args);
      throw new Error(`unexpected mutation ${name}`);
    },
  };
  return {
    run: () => tick._handler(ctx, { id: "thread" }),
    settle: (args) => settle._handler(ctx, args),
    stop: () => stop._handler(ctx, { sessionId: "session" }),
    state,
  };
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

test("denied and uncertain renewal preserve sandbox stop without claiming it succeeded", async () => {
  for (const outcome of ["denied", "unknown"]) {
    const f = make({
      sessionState: "renewing",
      paidUntil: Date.now() - 1,
      status: "stopping",
      stopRequests: true,
    });
    await f.run();
    expect(f.state.app.agent.status).toBe("stopping");
    expect(f.state.app.agent.delivery).toBe("uncertain-delivery");
    await f.settle({ debitId: "debit", outcome });
    expect(f.state.session.state).toBe(
      outcome === "denied" ? "stopping" : "hold",
    );
    expect(
      f.state.scheduled.some(
        (job) =>
          job.name === "agent/actions/compute:stop" &&
          job.args.sessionId === "session",
      ),
    ).toBe(true);
    await f.run();
    expect(f.state.finishes.at(-1).suspended).toBe(true);
    expect(f.state.finishes.some((args) => args.stopped)).toBe(false);
    await f.stop();
    expect(f.state.calls.stop).toBe(1);
    expect(f.state.session.stopConfirmed).toBeUndefined();
    expect(f.state.session.state).toBe(
      outcome === "denied" ? "stopping" : "hold",
    );
    expect(
      f.state.scheduled.filter(
        (job) => job.name === "agent/actions/compute:stop",
      ).length,
    ).toBeGreaterThan(1);
    if (outcome === "unknown") {
      await f.settle({
        debitId: "debit",
        outcome: "confirmed",
        responseBalance: 4,
      });
      expect(f.state.debit.lateConfirmation.responseBalance).toBe(4);
      expect(f.state.session.state).toBe("hold");
      expect(f.state.session.stopConfirmed).toBeUndefined();
    }
    expect(f.state.calls.prompt).toBe(0);
    expect(f.state.calls.network).toBe(0);
    expect(f.state.calls.debit).toBe(0);
    expect(f.state.remotePaths).toEqual([]);
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

test("abort survives pending boundary funding and interrupts after confirmation", async () => {
  for (const sessionState of ["active", "renewing"]) {
    const f = make({
      sessionState,
      paidUntil: Date.now() - 1,
      status: "stopping",
      stopRequests: true,
    });
    await f.run();
    expect(f.state.app.agent.status).toBe("stopping");
    expect(f.state.app.agent.delivery).toBe("uncertain-delivery");
    expect(f.state.app.agent.lease).toBeUndefined();
    expect(f.state.finishes[0].suspended).toBeUndefined();
    expect(f.state.scheduled[0].delay).toBe(2000);
    expect(f.state.calls.request).toBe(0);
    f.state.session.state = "active";
    f.state.session.paidUntil = Date.now() + 600_000;
    await f.run();
    expect(f.state.remotePaths).toEqual([
      "/conversations",
      "/interrupt?conversation=conversation",
      "/conversations",
    ]);
    expect(f.state.app.agent.status).toBe("idle");
    expect(f.state.app.agent.delivery).toBeUndefined();
    expect(f.state.finishes.at(-1).stopped).toBe(true);
    expect(f.state.calls.prompt).toBe(0);
    expect(f.state.calls.network).toBe(0);
    expect(f.state.calls.debit).toBe(0);
  }
});
