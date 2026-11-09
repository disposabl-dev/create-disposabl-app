import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.TELEMETRY_LINK_FIXTURE_URL;
if (base && base !== "http://127.0.0.1:3540")
  throw new Error("Only the owned loopback fixture is allowed");
async function call(
  kind: "query" | "mutation",
  path: string,
  args: object,
): Promise<any> {
  const response = await fetch(`${base}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? "Fixture request failed");
  return result.value;
}
const m = (name: string, args: object) => call("mutation", name, args);
const q = (name: string, args: object) => call("query", name, args);

test(
  "concurrent identity claims persist one link; guarded attempts recover and deletion denies",
  { skip: !base },
  async () => {
    const owner = await m("fixture:create", { pending: false });
    const other = await m("fixture:create", { pending: false });
    assert.equal(await m("link:claim", { newHash: "synthetic-anon" }), false);
    const candidate = {
      anonymous: "opaque-anonymous",
      distinct: "opaque-owner",
      eventId: "12345678-1234-4123-8123-123456789abc",
    };
    const results = await Promise.all([
      m("link:claim", {
        hash: "synthetic-anon",
        newHash: "unused-one",
        userId: owner.userId,
        link: candidate,
      }),
      m("link:claim", {
        hash: "synthetic-anon",
        newHash: "unused-two",
        userId: owner.userId,
        link: { ...candidate, eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }),
    ]);
    assert.deepEqual(results.sort(), [true, "linked"].sort());
    const row = await q("link:identity", { hash: "synthetic-anon" });
    assert.equal(row.userId, owner.userId);
    assert.equal(row.link.attempts, 0);
    const eventId = row.link.eventId;
    assert.equal((await q("link:lookup", { id: row._id })).eventId, eventId);
    const starts = await Promise.all([
      m("link:begin", { id: row._id, eventId, attempts: 0 }),
      m("link:begin", { id: row._id, eventId, attempts: 0 }),
    ]);
    assert.deepEqual(starts.sort(), [false, true]);
    await m("link:finish", { id: row._id, eventId, success: false });
    assert.equal(
      (await q("link:identity", { hash: "synthetic-anon" })).link.attempts,
      1,
    );
    assert.equal(
      await m("link:begin", { id: row._id, eventId, attempts: 1 }),
      true,
    );
    await m("link:finish", { id: row._id, eventId, success: true });
    assert.equal(
      (await q("link:identity", { hash: "synthetic-anon" })).link,
      undefined,
    );
    assert.equal(
      await m("link:begin", { id: row._id, eventId, attempts: 2 }),
      false,
    );
    const cross = await m("link:claim", {
      hash: "synthetic-anon",
      newHash: "different-owner",
      userId: other.userId,
      link: candidate,
    });
    assert.equal(cross, false);
    assert.equal(
      (await q("link:identity", { hash: "synthetic-anon" })).userId,
      owner.userId,
    );
    await m("fixture:reRequest", { userId: owner.userId, requestedAt: 111 });
    await assert.rejects(
      m("link:claim", {
        hash: "synthetic-anon",
        newHash: "blocked",
        userId: owner.userId,
        link: candidate,
      }),
    );
    assert.equal(await q("link:lookup", { id: row._id }), null);
  },
);
