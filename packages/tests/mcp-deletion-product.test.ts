import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.MCP_PRODUCT_FIXTURE_URL;
if (url && url !== "http://127.0.0.1:3550")
  throw new Error("MCP product fixture must use 127.0.0.1:3550");

test(
  "product request advances only attributable MCP cleanup and preserves the session",
  { skip: !url, timeout: 120000 },
  async () => {
    async function call(
      kind: "query" | "mutation" | "action",
      path: string,
      args: Record<string, unknown>,
      token?: string,
    ) {
      const response = await fetch(`${url}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      if (data.status !== "success")
        throw new Error(String(data.errorMessage ?? "fixture function failed"));
      return data.value;
    }
    const mutate = (
      name: string,
      args: Record<string, unknown>,
      token?: string,
    ) => call("mutation", name, args, token);
    const query = (
      name: string,
      args: Record<string, unknown>,
      token?: string,
    ) => call("query", name, args, token);
    const username = `mcpowner${randomUUID().replaceAll("-", "")}`;
    const password = `Fixture-${randomUUID()}!`;
    const prefix = randomUUID();
    const ownerKey = (i: number) => `${prefix}-owner-${i}`;
    const otherKey = `${prefix}-other`;
    assert.equal(
      (await mutate("auth:signUpWithUsernamePassword", { username, password }))
        .status,
      "complete",
    );
    const login = await mutate("auth:signInWithUsernamePassword", {
      username,
      password,
    });
    assert.equal(login.status, "complete");
    const access = login.tokens.accessToken as string;
    const userId = (await query("fixture:whoami", {}, access)) as string;
    assert.equal(typeof userId, "string");
    const other = await mutate("fixture:create", { label: "other" });
    const missing = await mutate("fixture:create", { label: "removed" });
    await mutate("fixture:remove", { userId: missing });
    for (let i = 0; i < 3; i++)
      await mutate("fixture:key", { userId, hash: ownerKey(i) });
    await mutate("fixture:key", { userId: other, hash: otherKey });
    assert.equal(
      await query("fixture:dispatch", { hash: ownerKey(0) }),
      userId,
    );
    assert.equal(await query("fixture:dispatch", { hash: otherKey }), other);
    const request = await mutate("fixture:requestReal", {}, access);
    assert.equal(request.status, "requested");
    assert.deepEqual(await mutate("fixture:requestReal", {}, access), request);
    assert.deepEqual(await query("fixture:statusReal", {}, access), request);
    assert.equal(await query("auth:isAuthenticated", {}, access), true);
    await assert.rejects(
      query("fixture:dispatch", { hash: ownerKey(0) }),
      /Account is unavailable/,
    );
    assert.equal(
      (await query("fixture:verify", { hash: ownerKey(0) })).userId,
      userId,
    );
    await assert.rejects(
      mutate("fixture:batch", {
        userId: other,
        expectedRequestedAt: request.requestedAt,
      }),
      /Matching deletion request not found/,
    );
    await assert.rejects(
      mutate("fixture:batch", {
        userId: missing,
        expectedRequestedAt: request.requestedAt,
      }),
      /Matching deletion request not found/,
    );
    await assert.rejects(
      mutate("fixture:batch", {
        userId,
        expectedRequestedAt: request.requestedAt + 1,
      }),
      /Matching deletion request not found/,
    );
    await assert.rejects(
      mutate("users/mcpDeletion:runBatch", {
        userId,
        expectedRequestedAt: request.requestedAt,
      }),
      /not found|not public|Could not find/i,
    );
    const args = { userId, expectedRequestedAt: request.requestedAt };
    const first = await mutate("fixture:batch", args);
    assert.equal(first.state, "in_progress");
    assert.equal(first.batches, 1);
    assert.equal(first.grantsDeleted, 1);
    assert.deepEqual(await query("fixture:progress", { userId }), first);
    const queue = await query("fixture:queue", {});
    const queued = queue.page.find(
      (item: { userId: string }) => item.userId === userId,
    );
    assert.deepEqual(queued?.mcpDeletion, first);
    assert.equal(queued?.status, "requested");
    assert.equal(await query("fixture:verify", { hash: ownerKey(1) }), null);
    await assert.rejects(
      mutate("fixture:key", { userId, hash: `${prefix}-late` }),
      /Account is unavailable/,
    );
    assert.equal(await query("fixture:dispatch", { hash: otherKey }), other);
    await Promise.all([
      mutate("fixture:batch", args),
      mutate("fixture:batch", args),
    ]);
    const final = await query("fixture:progress", { userId });
    assert.equal(final.state, "attributed_complete");
    assert.equal(final.batches, 3);
    assert.equal(final.grantsDeleted, 3);
    assert.equal(final.tokensDeleted, 3);
    assert.equal(final.requestsDeleted, 0);
    assert.deepEqual(await mutate("fixture:batch", args), final);
    assert.deepEqual(await query("fixture:statusReal", {}, access), request);
    assert.equal(await query("auth:isAuthenticated", {}, access), true);
    assert.equal(await query("fixture:whoami", {}, access), userId);
    assert.equal(
      (await query("fixture:verify", { hash: otherKey })).userId,
      other,
    );
  },
);
