import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.ACCOUNT_DELETION_FIXTURE_URL;
if (url && !["http://127.0.0.1:3540", "http://localhost:3540"].includes(url))
  throw new Error("Account deletion fixture requires loopback port 3540");
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
test(
  "requests are authenticated, idempotent and isolated under concurrent calls",
  { skip: !url },
  async () => {
    const alice = await call("create", { label: randomUUID() });
    const bob = await call("create", { label: randomUUID() });
    await assert.rejects(
      call("request", { userId: null, confirmation: "DELETE" }),
      /Sign in/,
    );
    await assert.rejects(
      call("request", { userId: alice, confirmation: "delete" }),
      /Type DELETE/,
    );
    assert.equal(await call("status", { userId: alice }, true), null);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call("request", { userId: alice, confirmation: "DELETE" }),
      ),
    );
    assert.ok(
      results.every(
        (x) =>
          x.status === "requested" && x.requestedAt === results[0].requestedAt,
      ),
    );
    assert.deepEqual(await call("status", { userId: alice }, true), results[0]);
    assert.equal(await call("status", { userId: bob }, true), null);
    assert.equal(await call("pending", { userId: alice }, true), true);
    assert.equal(await call("pending", { userId: bob }, true), false);
    const queue = await call("queue", {}, true);
    assert.equal(
      queue.page.filter((row: any) => row.userId === alice).length,
      1,
    );
    assert.equal(
      queue.page.some((row: any) => row.userId === bob),
      false,
    );
  },
);

test(
  "deletion and work admission serialize and later work is fenced",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    const results = await Promise.allSettled([
      call("request", { userId, confirmation: "DELETE" }),
      call("attemptWork", { userId }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    await assert.rejects(
      call("attemptWork", { userId }),
      /Account deletion has been requested/,
    );
    assert.equal((await call("status", { userId }, true)).status, "requested");
  },
);

test(
  "stop attempts serialize, preserve uncertainty and require an explicit retry",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    await call("request", { userId, confirmation: "DELETE" });
    const claims = await Promise.all([
      call("claimStop", { userId, token: "first" }),
      call("claimStop", { userId, token: "second" }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const token = claims[0] ? "first" : "second";
    assert.equal(
      await call("finishStop", {
        userId,
        token: "wrong",
        outcome: "archived_observed",
      }),
      false,
    );
    await call("expireStop", { userId });
    assert.equal(
      await call("finishStop", { userId, token, outcome: "archived_observed" }),
      false,
    );
    let queue = await call("queue", {}, true);
    assert.equal(
      queue.page.find((row: any) => row.userId === userId).stop,
      "unknown",
    );
    assert.equal(await call("claimStop", { userId, token: "retry" }), true);
    assert.equal(
      await call("claimStop", { userId, token: "duplicate" }),
      false,
    );
    assert.equal(
      await call("finishStop", { userId, token, outcome: "archived_observed" }),
      false,
    );
    assert.equal(
      await call("finishStop", { userId, token: "retry", outcome: "failed" }),
      true,
    );
    assert.equal(await call("claimStop", { userId, token: "final" }), true);
    assert.equal(
      await call("finishStop", {
        userId,
        token: "final",
        outcome: "archived_observed",
      }),
      true,
    );
    queue = await call("queue", {}, true);
    assert.equal(
      queue.page.find((row: any) => row.userId === userId).stop,
      "archived_observed",
    );
    assert.equal(await call("claimStop", { userId, token: "again" }), true);
    assert.equal((await call("status", { userId }, true)).status, "requested");
  },
);
