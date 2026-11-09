import { test } from "node:test";
import assert from "node:assert/strict";
import { v } from "convex/values";
import { internalMutation } from "../disposabl-kit/server/lib/functions";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";
import { createMcpApi } from "../disposabl-kit/server/http";

const operation = internalMutation({
  platforms: true,
  args: { userId: v.string(), value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => args.value,
});
const user = {
  userId: "owner",
  scopes: [],
  clientId: "fixture",
  connectionId: "fixture",
};
test("MCP and REST check eligibility at dispatch before operation or telemetry", async () => {
  let pending = false,
    operations = 0,
    captures = 0;
  const ctx = {
    runMutation: async () => {
      operations++;
      return "ok";
    },
    scheduler: {
      runAfter: async () => {
        captures++;
      },
    },
  } as any;
  const platform = createPlatforms(
    { "test/internal": { operation } },
    async (_ctx, id) => id !== "owner" || !pending,
  );
  const tool = platform.tools.test_internal_operation;
  assert.equal(await tool.handler(ctx, { value: "hello" }, user), "ok");
  pending = true;
  await assert.rejects(
    tool.handler(ctx, { value: "hello" }, user),
    /Account is unavailable/,
  );
  assert.equal(operations, 1);
  assert.equal(captures, 0);
  assert.equal(
    await tool.handler(ctx, { value: "hello" }, { ...user, userId: "other" }),
    "ok",
  );
  const response = await platform.handleApi(
    ctx,
    new Request("https://example.test/api/test/operation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "hello" }),
    }),
    async () => user,
  );
  assert.equal(response.status, 403);
  assert.equal(operations, 2);
  assert.equal(captures, 0);
  const starter = createPlatforms({ "test/internal": { operation } });
  assert.equal(
    await starter.tools.test_internal_operation.handler(
      ctx,
      { value: "hello" },
      user,
    ),
    "ok",
  );
});

test("pending user cannot issue API keys or approve OAuth but can revoke grants", async () => {
  let pending = true,
    mutations = 0;
  const api = createMcpApi(async () => !pending);
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "fixture" }) },
    runQuery: async () => ({ userId: "owner" }),
    runMutation: async () => {
      mutations++;
      return true;
    },
  };
  await assert.rejects(
    (api.createApiKey as any)._handler(ctx, { name: "test" }),
    /Not signed in/,
  );
  await assert.rejects(
    (api.authorize as any)._handler(ctx, { requestId: "test", approve: true }),
    /Not signed in/,
  );
  assert.equal(mutations, 0);
  await (api.revokeConnection as any)._handler(ctx, { id: "grant" });
  assert.equal(mutations, 1);
  pending = false;
});
