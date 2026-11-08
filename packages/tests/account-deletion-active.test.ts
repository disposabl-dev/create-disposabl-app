import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.ACCOUNT_DELETION_FIXTURE_URL;
if (url && !["http://127.0.0.1:3540", "http://localhost:3540"].includes(url))
  throw new Error("Account deletion fixture requires loopback port 3540");
async function call(name: string, args: object, query = false): Promise<any> {
  const r = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await r.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
test(
  "native session guard fences pending owner but preserves other users and status",
  { skip: !url },
  async () => {
    const alice = await call("create", { label: randomUUID() });
    const bob = await call("create", { label: randomUUID() });
    assert.equal(await call("active", { userId: alice }, true), alice);
    await call("request", { userId: alice, confirmation: "DELETE" });
    assert.equal(await call("active", { userId: alice }, true), null);
    assert.equal(await call("nativeApp", { userId: alice }, true), null);
    assert.deepEqual(await call("nativeApp", { userId: bob }, true), {
      appId: "fixture",
      userId: bob,
    });
    assert.equal(await call("active", { userId: bob }, true), bob);
    assert.equal(await call("active", { userId: null }, true), null);
    assert.equal(
      (await call("status", { userId: alice }, true)).status,
      "requested",
    );
  },
);
