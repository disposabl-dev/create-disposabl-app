import { test } from "node:test";
import assert from "node:assert/strict";
import { v } from "convex/values";
import { internalQuery } from "../disposabl-kit/server/lib/functions";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";
import { agentApiPolicy } from "../backend/convex/agent/api_policy";
import {
  authenticate,
  issue,
  digest,
  accessPrefix,
} from "../backend/convex/agent/access";
import { sandboxRef } from "../backend/convex/agent/boat";

const bearer = accessPrefix + "a".repeat(64);
const binding = { userId: "owner", appId: "app-a", threadId: "thread-a" };

test("agent REST access rejects other apps, account operations, recursion and malformed tokens", async () => {
  const get = internalQuery({
    platforms: true,
    args: { userId: v.string(), appId: v.string() },
    returns: v.string(),
    handler: async () => "ok",
  });
  const api = createPlatforms({
    "apps/internal": { get, delete: get },
    "agent/internal": { sendMessage: get },
  });
  let calls = 0,
    fallbackCalls = 0;
  const ctx = {
    runQuery: async (_ref: unknown, args: any) => {
      if (args.hash) {
        assert.equal(args.hash, await digest(bearer));
        return binding;
      }
      calls++;
      assert.equal(args.userId, "owner");
      return "ok";
    },
  } as any;
  const fallback = async () => {
    fallbackCalls++;
    return null;
  };
  async function request(path: string, appId: string, token = bearer) {
    return api.handleApi(
      ctx,
      new Request(
        `https://example.com/api/${path}?appId=${encodeURIComponent(JSON.stringify(appId))}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
      fallback,
      agentApiPolicy,
    );
  }
  assert.equal((await request("apps/get", "app-a")).status, 200);
  assert.equal((await request("apps/get", "app-b")).status, 403);
  assert.equal((await request("apps/delete", "app-a")).status, 403);
  assert.equal((await request("agent/sendMessage", "app-a")).status, 403);
  assert.equal(
    (await request("apps/get", "app-a", accessPrefix + "invalid")).status,
    401,
  );
  assert.equal(calls, 1);
  assert.equal(fallbackCalls, 0);
  await request("apps/get", "app-a", "normal-oauth-token");
  assert.equal(fallbackCalls, 1);
});

test("agent credential lookup rejects expired, stopped, failed, deleted and unconfirmed work", async () => {
  const app = {
    ...binding,
    agent: {
      threadId: binding.threadId,
      status: "processing",
      access: { expiresAt: Date.now() + 60_000 },
    },
  };
  let row: any = app;
  const ctx = {
    db: { query: () => ({ withIndex: () => ({ unique: async () => row }) }) },
  };
  const lookup = () => (authenticate as any)._handler(ctx, { hash: "fixture" });
  assert.deepEqual(await lookup(), binding);
  for (const status of ["idle", "stopping", "failed"]) {
    row = { ...app, agent: { ...app.agent, status } };
    assert.equal(await lookup(), null);
  }
  row = { ...app, agent: { ...app.agent, access: { expiresAt: 0 } } };
  assert.equal(await lookup(), null);
  row = { ...app, agent: { ...app.agent, stopUnconfirmed: true } };
  assert.equal(await lookup(), null);
  row = { ...app, operation: { kind: "delete" } };
  assert.equal(await lookup(), null);
  row = null;
  assert.equal(await lookup(), null);
});

test("only the current unexpired worker can issue access; sandboxes belong to users", async () => {
  const app = {
    ...binding,
    agent: {
      threadId: binding.threadId,
      status: "processing",
      lease: { token: "lease", expiresAt: Date.now() + 60_000 },
    },
  };
  let row: any = app;
  let patch: any;
  const ctx = {
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      patch: async (_table: string, _id: string, value: unknown) => {
        patch = value;
      },
    },
  };
  const args = { id: binding.threadId, token: "lease", hash: "a".repeat(64) };
  await (issue as any)._handler(ctx, args);
  assert.equal(patch.agent.access.hash, args.hash);
  assert.equal(JSON.stringify(patch).includes(bearer), false);
  for (const agent of [
    { ...app.agent, status: "stopping" },
    { ...app.agent, stopUnconfirmed: true },
    { ...app.agent, lease: { token: "other", expiresAt: Date.now() + 60_000 } },
    { ...app.agent, lease: { token: "lease", expiresAt: 0 } },
  ]) {
    row = { ...app, agent };
    await assert.rejects(
      (issue as any)._handler(ctx, args),
      /active worker lease/,
    );
  }
  assert.notDeepEqual(sandboxRef("owner"), sandboxRef("other-owner"));
});
