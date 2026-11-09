import { test, expect, mock } from "bun:test";
import { getFunctionName } from "convex/server";
import { resolve } from "node:path";
const path = (p) =>
  resolve(import.meta.dir, "../../../backend/convex/agent", p);
let current;
mock.module("@disposabl/disposabl-kit/features", () => ({
  paymentsEnabled: true,
}));
mock.module(path("boat.ts"), () => ({
  sandboxRef: (userId) => ({ ownerId: userId, key: "workspace" }),
  boat: {
    exec: async (_ctx, args) => {
      current.commands.push(args);
      if (current.commands.length === 1) current.afterPrepare?.();
      return { exitCode: 0, timedOut: false };
    },
    writeFile: async (_ctx, args) => {
      current.writes.push(args);
      current.afterWrite?.();
    },
  },
}));
globalThis.fetch = async () => {
  throw new Error("network forbidden");
};
process.env.CONVEX_SITE_URL = "https://fixture.invalid";
const { authorizeSandbox } = await import(path("bootstrap.ts"));
const { issue, authenticate, digest } = await import(path("access.ts"));
const realNow = Date.now;
let now = 1_800_000_000_000;
Date.now = () => now;
function setup() {
  now = 1_800_000_000_000;
  current = {
    commands: [],
    writes: [],
    patches: 0,
    owner: {},
    session: {
      _id: "session",
      userId: "owner",
      state: "active",
      activation: "active",
      paidUntil: now + 60000,
    },
    app: {
      _id: "app-row",
      appId: "app-a",
      userId: "owner",
      agent: {
        threadId: "thread-a",
        computeSessionId: "session",
        status: "processing",
        pending: [],
        lease: { token: "lease", expiresAt: now + 120000 },
      },
    },
  };
  const db = {
    normalizeId: (_table, id) => id,
    get: async (_table, id) =>
      id === "owner"
        ? current.owner
        : id === "session"
          ? current.session
          : null,
    query: (table) => ({
      withIndex: (index, fn) => {
        let value;
        const conditions = {};
        const selector = {
          eq: (_key, v) => {
            value = v;
            conditions[_key] = v;
            return selector;
          },
        };
        fn(selector);
        return {
          first: async () =>
            table === "apps" &&
            index === "by_userId_stopUnconfirmed" &&
            conditions.userId === "owner" &&
            conditions["agent.stopUnconfirmed"] === true &&
            current.otherUnconfirmed
              ? { userId: "owner", agent: { stopUnconfirmed: true } }
              : null,
          unique: async () =>
            table === "apps" &&
            ((index === "by_threadId" &&
              value === current.app.agent.threadId) ||
              (index === "by_appId" && value === current.app.appId) ||
              (index === "by_agentAccessHash" &&
                value === current.app.agent.access?.hash))
              ? current.app
              : null,
        };
      },
    }),
    patch: async (_table, _id, patch) => {
      current.patches++;
      current.app = { ...current.app, ...patch };
    },
  };
  const mutationCtx = { db };
  const actionCtx = {
    runQuery: async (ref, args) => {
      expect(getFunctionName(ref)).toBe("agent/access:authenticate");
      return authenticate._handler(mutationCtx, args);
    },
    runMutation: async (ref, args) => {
      expect(getFunctionName(ref)).toBe("agent/access:issue");
      return issue._handler(mutationCtx, args);
    },
  };
  return {
    authorize: (
      identity = { userId: "owner", appId: "app-a" },
      lease = { id: "thread-a", token: "lease" },
    ) => authorizeSandbox(actionCtx, identity, lease),
    authenticate: (hash) => authenticate._handler({ db }, { hash }),
    state: current,
  };
}

test("active paid lease writes scoped credential and real access lookup fences it", async () => {
  const f = setup();
  await f.authorize();
  expect(f.state.writes).toHaveLength(1);
  expect(f.state.commands).toHaveLength(2);
  const write = f.state.writes[0];
  expect(write.ownerId).toBe("owner");
  expect(write.path).toContain("/apps/app-a/");
  const token = JSON.parse(write.content).tokens.access_token;
  const hash = await digest(token);
  expect(f.state.app.agent.access.hash).toBe(hash);
  expect(JSON.stringify(f.state.commands).includes(token)).toBe(false);
  expect(await f.authenticate(hash)).toEqual({
    userId: "owner",
    appId: "app-a",
    threadId: "thread-a",
  });
  const deadline = f.state.session.paidUntil;
  now = deadline;
  expect(await f.authenticate(hash)).toBeNull();
  now = deadline - 1;
  f.state.session.state = "hold";
  expect(await f.authenticate(hash)).toBeNull();
  f.state.session.state = "active";
  f.state.owner = { deletionRequestedAt: now };
  expect(await f.authenticate(hash)).toBeNull();
  f.state.owner = {};
  f.state.session.state = "stopped";
  expect(await f.authenticate(hash)).toBeNull();
});

test("blocked session, stale lease and wrong session owner cannot mint", async () => {
  for (const block of [
    "expired",
    "hold",
    "deleted",
    "stopped",
    "wronglease",
    "session_owner",
  ]) {
    const f = setup();
    let identity = { userId: "owner", appId: "app-a" },
      lease = { id: "thread-a", token: "lease" };
    if (block === "expired") now = f.state.session.paidUntil;
    if (block === "hold") f.state.session.state = "hold";
    if (block === "deleted") f.state.owner = { deletionRequestedAt: now };
    if (block === "stopped") f.state.session.state = "stopped";
    if (block === "wronglease") lease.token = "invalid";
    if (block === "session_owner") f.state.session.userId = "other";
    let denied = false;
    try {
      await f.authorize(identity, lease);
    } catch {
      denied = true;
    }
    expect(denied, block).toBe(true);
    expect(f.state.patches).toBe(0);
    expect(f.state.commands).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  }
});

test("a shared stop raised during preparation prevents the credential write", async () => {
  const f = setup();
  f.state.afterPrepare = () => {
    f.state.otherUnconfirmed = true;
  };
  await expect(f.authorize()).rejects.toThrow("authorization ended");
  expect(f.state.commands).toHaveLength(1);
  expect(f.state.writes).toHaveLength(0);
  expect(await f.authenticate(f.state.app.agent.access.hash)).toBeNull();
});

test("a shared stop raised during writing prevents the final rename", async () => {
  const f = setup();
  f.state.afterWrite = () => {
    f.state.otherUnconfirmed = true;
  };
  await expect(f.authorize()).rejects.toThrow("authorization ended");
  expect(f.state.commands).toHaveLength(1);
  expect(f.state.writes).toHaveLength(1);
  expect(await f.authenticate(f.state.app.agent.access.hash)).toBeNull();
});

test("lease expiry or replacement during preparation prevents later dispatch", async () => {
  for (const change of ["expiry", "replacement"]) {
    const f = setup();
    f.state.afterPrepare = () => {
      if (change === "expiry") f.state.app.agent.lease.expiresAt = now;
      else f.state.app.agent.lease.token = "replacement";
    };
    await expect(f.authorize()).rejects.toThrow("authorization ended");
    expect(f.state.commands).toHaveLength(1);
    expect(f.state.writes).toHaveLength(0);
  }
});
for (const identity of [
  { userId: "other", appId: "app-a" },
  { userId: "owner", appId: "other-app" },
]) {
  test(`bootstrap rejects mismatched ${identity.userId === "other" ? "owner" : "app"}`, async () => {
    const f = setup();
    await expect(f.authorize(identity)).rejects.toThrow();
    expect(f.state.patches).toBe(0);
    expect(f.state.commands).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
  });
}
process.on("exit", () => {
  Date.now = realNow;
});
