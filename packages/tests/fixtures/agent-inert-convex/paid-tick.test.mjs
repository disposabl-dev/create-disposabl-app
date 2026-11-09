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
mock.module("@convex-dev/agent", () => ({
  saveMessage: async () => ({ messageId: "new-message" }),
  listMessages: async () => [],
}));
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
      if (state.activationError === "create")
        throw new Error("Synthetic activation response lost");
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
      if (state.activationError === "resume")
        throw new Error("Synthetic activation response lost");
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
  ownedAttachments: async () => [],
  attachmentReferences: async () => [],
}));
const { tick } = await import(paths("actions/run.ts"));
const { enqueueMessageHandler } = await import(paths("internal.ts"));
const { finish, claim: claimWorker } = await import(paths("state.ts"));
const { settle, stopping, stopped, workBlocked } = await import(
  paths("compute.ts")
);
const { stop } = await import(paths("actions/compute.ts"));
const activationHandlers = await import(paths("activation.ts"));

function make({
  sessionState = "active",
  activation = "active",
  paidUntil = Date.now() + 60_000,
  pending = false,
  sandbox = true,
  archived = false,
  changeAt,
  changeKind,
  status = "processing",
  stopRequests = false,
  agent = {},
  queued = true,
} = {}) {
  state = {
    session: {
      _id: "session",
      userId: "owner",
      state: sessionState,
      activation,
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
    otherApps: [],
    queued,
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
        ...agent,
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
      else if (changeKind === "remote-uncertain") this.otherUnconfirmed = true;
      else this.pending = true;
    },
  };
  const ctx = {
    db: {
      normalizeId: (_table, id) => id,
      get: async (table, id) =>
        table === "users"
          ? { deletionRequestedAt: state.pending ? Date.now() : undefined }
          : table === "computeSessions" && id === "session"
            ? state.session
            : table === "computeDebits" && id === "debit"
              ? state.debit
              : null,
      query: (table) => {
        const conditions = [];
        const indexQuery = {};
        for (const op of ["eq", "lt", "gt"])
          indexQuery[op] = (key, value) => {
            conditions.push([op, key, value]);
            return indexQuery;
          };
        const matches = () => {
          const rows =
            table === "computeSessions"
              ? [state.session]
              : table === "apps"
                ? [
                    state.app,
                    ...state.otherApps,
                    ...(state.otherUnconfirmed
                      ? [
                          {
                            _id: "other",
                            userId: "owner",
                            agent: { stopUnconfirmed: true },
                          },
                        ]
                      : []),
                  ]
                : [];
          return rows.filter((row) =>
            conditions.every(([op, key, value]) => {
              const actual = key
                .split(".")
                .reduce((item, field) => item?.[field], row);
              return op === "eq"
                ? actual === value
                : op === "lt"
                  ? actual === undefined || actual < value
                  : actual !== undefined && actual > value;
            }),
          );
        };
        const chain = {
          withIndex: (_name, select) => {
            select(indexQuery);
            return chain;
          },
          unique: async () => matches()[0] ?? null,
          order: () => chain,
          first: async () => matches()[0] ?? null,
          take: async (limit) => matches().slice(0, limit),
        };
        return chain;
      },
      patch: async (table, _id, patch) =>
        Object.assign(
          table === "computeSessions"
            ? state.session
            : table === "computeDebits"
              ? state.debit
              : [state.app, ...state.otherApps].find((app) => app._id === _id),
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
      if (name === "agent/compute:workBlocked")
        return workBlocked._handler(ctx, { userId: "owner" });
      if (name === "apps/internal:get")
        return { name: "fixture", platforms: ["web"] };
      throw new Error(`unexpected query ${name}`);
    },
    runMutation: async (ref, args) => {
      let name;
      try {
        name = getFunctionName(ref);
      } catch (error) {
        if (
          String(error).includes(
            "_reference/childComponent/agent/messages/updateMessage",
          )
        )
          return null;
        throw error;
      }
      if (name.startsWith("agent/activation:"))
        return activationHandlers[name.split(":")[1]]._handler(ctx, args);
      if (name === "agent/state:claim") {
        expect(args.activationProtocol).toBe(1);
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
        return state.queued
          ? { prompt: "synthetic", messageId: "message", fileIds: [] }
          : null;
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
    context: ctx,
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
      status: "processing",
      agent: { delivery: "uncertain-delivery" },
    });
    await f.run();
    expect(f.state.app.agent.status).toBe("processing");
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
        activation: changeAt === "resume" ? "fresh" : "active",
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
    { sandbox: false, activation: "fresh" },
    { sandbox: true, archived: true, activation: "fresh" },
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

test("suspension preserves evidence of unresolved remote work", async () => {
  for (const agent of [
    { promptId: "prompt", conversationId: "conversation" },
    { delivery: "uncertain-delivery" },
    { conversationId: "conversation" },
  ]) {
    const f = make({ sessionState: "hold", agent });
    await f.run();
    expect(f.state.finishes[0].suspended).toBe(true);
    expect(f.state.app.agent.stopUnconfirmed).toBe(true);
    for (const [key, value] of Object.entries(agent))
      expect(f.state.app.agent[key]).toBe(value);
    expect(f.state.calls.resume).toBe(0);
    verifyNoExternal(f.state);
  }
});

test("unsent pending work alone does not mark remote execution unconfirmed", async () => {
  const f = make({ sessionState: "hold", agent: { pending: ["unsent"] } });
  await f.run();
  expect(f.state.finishes[0].suspended).toBe(true);
  expect(f.state.app.agent.pending).toEqual([]);
  expect(f.state.app.agent.stopUnconfirmed).not.toBe(true);
  verifyNoExternal(f.state);
});

test("archived abort preserves remote identifiers and does not claim interruption", async () => {
  const f = make({
    status: "stopping",
    archived: true,
    stopRequests: true,
    agent: {
      promptId: "prompt",
      conversationId: "conversation",
      stopUnconfirmed: true,
    },
  });
  await f.run();
  expect(f.state.calls.resume).toBe(0);
  expect(f.state.remotePaths).toEqual([]);
  expect(f.state.finishes.some((x) => x.stopped)).toBe(false);
  expect(f.state.app.agent.promptId).toBe("prompt");
  expect(f.state.app.agent.conversationId).toBe("conversation");
  expect(f.state.app.agent.delivery).toBe("uncertain-delivery");
  expect(f.state.app.agent.stopUnconfirmed).toBe(true);
  expect(f.state.calls.network).toBe(0);
  expect(f.state.calls.debit).toBe(0);
});

test("conversation-only abort remains unconfirmed when sandbox is archived or missing", async () => {
  for (const options of [{ archived: true }, { sandbox: false }]) {
    const f = make({
      ...options,
      status: "stopping",
      agent: { conversationId: "conversation" },
    });
    await f.run();
    expect(f.state.calls.resume).toBe(0);
    expect(f.state.remotePaths).toEqual([]);
    expect(f.state.finishes.some((x) => x.stopped)).toBe(false);
    expect(f.state.app.agent.conversationId).toBe("conversation");
    expect(f.state.app.agent.stopUnconfirmed).toBe(true);
    expect(f.state.calls.network).toBe(0);
    expect(f.state.calls.debit).toBe(0);
  }
});

test("abort interrupts running conversation despite unavailable funding", async () => {
  for (const sessionState of ["renewing", "stopping", "hold"]) {
    const f = make({
      sessionState,
      paidUntil: Date.now() - 1,
      status: "stopping",
      stopRequests: true,
      agent: {
        promptId: "prompt",
        conversationId: "conversation",
        delivery: undefined,
        stopUnconfirmed: true,
      },
    });
    await f.run();
    expect(f.state.remotePaths).toEqual([
      "/interrupt?conversation=conversation",
      "/conversations",
    ]);
    expect(f.state.finishes.at(-1).stopped).toBe(true);
    expect(f.state.app.agent.stopUnconfirmed).toBeUndefined();
    expect(f.state.app.agent.promptId).toBeUndefined();
    expect(f.state.calls.resume).toBe(0);
    expect(f.state.calls.prompt).toBe(0);
    expect(f.state.calls.debit).toBe(0);
    expect(f.state.calls.network).toBe(0);
  }
});

test("uncertain delivery with a known conversation remains unconfirmed after idle observation", async () => {
  const f = make({
    status: "stopping",
    stopRequests: true,
    agent: { conversationId: "conversation", delivery: "uncertain-delivery" },
  });
  await f.run();
  expect(f.state.finishes.some((x) => x.stopped)).toBe(false);
  expect(f.state.app.agent.delivery).toBe("uncertain-delivery");
  expect(f.state.app.agent.conversationId).toBe("conversation");
  expect(f.state.app.agent.stopUnconfirmed).toBe(true);
  expect(f.state.calls.resume).toBe(0);
  expect(f.state.calls.debit).toBe(0);
  expect(f.state.calls.network).toBe(0);
});

test("completed turn followed by unsent work and suspension is not remote uncertainty", async () => {
  const f = make({
    queued: false,
    agent: { promptId: "prompt", conversationId: "conversation" },
  });
  await f.run();
  expect(f.state.finishes.at(-1).done).toBe(true);
  expect(f.state.app.agent.promptId).toBeUndefined();
  expect(f.state.app.agent.conversationId).toBe("conversation");
  f.state.app.agent.status = "processing";
  f.state.app.agent.pending = ["unsent"];
  f.state.session.state = "hold";
  await f.run();
  expect(f.state.finishes.at(-1).suspended).toBe(true);
  expect(f.state.app.agent.stopUnconfirmed).not.toBe(true);
  expect(f.state.app.agent.pending).toEqual([]);
  expect(f.state.calls.debit).toBe(0);
  expect(f.state.calls.network).toBe(0);
});

test("another app becoming unconfirmed at refresh fences an already-admitted resume", async () => {
  const f = make({
    sandbox: true,
    archived: true,
    changeAt: "refresh",
    changeKind: "remote-uncertain",
  });
  await f.run();
  expect(f.state.calls.refresh).toBe(1);
  expect(f.state.otherUnconfirmed).toBe(true);
  expect(f.state.calls.resume).toBe(0);
  expect(f.state.calls.prompt).toBe(0);
  expect(f.state.calls.authorize).toBe(0);
  expect(f.state.calls.debit).toBe(0);
  expect(f.state.calls.network).toBe(0);
});

test("legacy completed history is normalized only when completion is unambiguous", async () => {
  const appId = "12345678-1234-4123-8123-123456789abc";
  for (const [variant, patch, expected] of [
    ["completed", {}, true],
    ["failed", { status: "failed", error: "failed" }, false],
    ["uncertain delivery", { delivery: "unknown" }, false],
    ["unordered timestamps", { finishedAt: 9 }, false],
    [
      "active lease",
      { lease: { token: "lease", expiresAt: 9999999999999 } },
      false,
    ],
  ]) {
    const f = make({
      agent: {
        status: "idle",
        computeSessionId: undefined,
        promptId: "old-prompt",
        conversationId: "conversation",
        startedAt: 10,
        finishedAt: 20,
        ...patch,
      },
    });
    f.state.app.appId = appId;
    const ctx = f.context;
    await enqueueMessageHandler(
      ctx,
      { userId: "owner", appId, prompt: "next" },
      () => true,
      false,
    );
    expect(f.state.app.agent.promptId).toBe(
      expected ? undefined : "old-prompt",
    );
    expect(f.state.app.agent.turnCompleted).toBe(expected ? true : undefined);
    expect(f.state.app.agent.conversationId).toBe("conversation");
  }
  const blocked = make({
    agent: {
      status: "idle",
      computeSessionId: undefined,
      promptId: "old-prompt",
      conversationId: "conversation",
      startedAt: 10,
      finishedAt: 20,
      stopUnconfirmed: true,
    },
  });
  blocked.state.app.appId = appId;
  await expect(
    enqueueMessageHandler(
      blocked.context,
      { userId: "owner", appId, prompt: "next" },
      () => true,
      false,
    ),
  ).rejects.toThrow(/could not be stopped/);
  expect(blocked.state.app.agent.promptId).toBe("old-prompt");
});

test("an archived activated sandbox stops without resuming or losing remote evidence", async () => {
  const f = make({
    archived: true,
    agent: {
      promptId: "prompt",
      conversationId: "conversation",
      pending: ["queued"],
    },
  });
  await f.run();
  expect(f.state.session.state).toBe("stopping");
  expect(f.state.calls.resume).toBe(0);
  expect(f.state.calls.prompt).toBe(0);
  expect(f.state.app.agent.promptId).toBe("prompt");
  expect(f.state.app.agent.conversationId).toBe("conversation");
  expect(f.state.app.agent.stopUnconfirmed).toBe(true);
  expect(f.state.app.agent.pending).toEqual([]);
  verifyNoExternal(f.state);
});

test("legacy cross-app uncertainty blocks first activation and exposes a stop fence", async () => {
  const f = make({ archived: true, activation: "fresh" });
  f.state.otherApps.push({
    _id: "legacy",
    appId: "legacy",
    userId: "owner",
    agent: {
      threadId: "legacy",
      status: "idle",
      pending: [],
      updatedAt: 1,
      promptId: "unresolved",
    },
  });
  await f.run();
  expect(f.state.session.state).toBe("stopping");
  expect(f.state.otherApps[0].agent.stopUnconfirmed).toBe(true);
  expect(f.state.otherApps[0].agent.promptId).toBe("unresolved");
  expect(f.state.calls.resume).toBe(0);
  expect(f.state.calls.create).toBe(0);
  expect(f.state.calls.prompt).toBe(0);
  verifyNoExternal(f.state);
});

test("another first worker waits without repeating the claimed activation", async () => {
  const f = make({ archived: true, activation: "claimed" });
  f.state.session.activationLease = {
    token: "other-action",
    until: Date.now() + 660000,
  };
  await f.run();
  expect(f.state.finishes[0].delay).toBe(2000);
  expect(
    f.state.calls.create + f.state.calls.resume + f.state.calls.prompt,
  ).toBe(0);
  verifyNoExternal(f.state);
});

test("lost create or resume responses retain the activation fence before stop", async () => {
  for (const operation of ["create", "resume"]) {
    const f = make({
      sandbox: operation === "resume",
      archived: true,
      activation: "fresh",
    });
    f.state.activationError = operation;
    await f.run();
    expect(f.state.session.activation).toBe("uncertain");
    expect(f.state.session.state).toBe("stopping");
    expect(f.state.session.activationLease.until).toBeGreaterThan(
      Date.now() + 600000,
    );
    await f.stop();
    expect(f.state.calls.stop).toBe(0);
    expect(f.state.session.stopConfirmed).not.toBe(true);
    expect(f.state.calls[operation]).toBe(1);
    expect(
      f.state.calls.prompt + f.state.calls.network + f.state.calls.debit,
    ).toBe(0);
  }
});

test("pre-deployment paid action cannot acquire a new worker lease", async () => {
  const { context: ctx } = make({ activation: "fresh" });
  state.app.agent.lease = undefined;
  const id = state.app.agent.threadId;
  expect(await claimWorker._handler(ctx, { id, token: "old-code" })).toBeNull();
  expect(state.app.agent.lease).toBeUndefined();
  expect(state.calls.create + state.calls.resume).toBe(0);
  const current = await claimWorker._handler(ctx, {
    id,
    token: "current-code",
    activationProtocol: 1,
  });
  expect(current?.lease?.token).toBe("current-code");
});
