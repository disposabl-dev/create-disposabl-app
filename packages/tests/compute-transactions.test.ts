import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Only run against the separate, disposable fixture deployment; never the app backend.
const url = process.env.COMPUTE_FIXTURE_URL;
if (url && !["http://127.0.0.1:3420", "http://localhost:3420"].includes(url))
  throw new Error(
    "Compute fixture requires the isolated loopback deployment on port 3420",
  );
async function call(name: string, args: object, query = false) {
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
  "real Convex transactions serialize claims, boundary, stop and explicit resume",
  { skip: !url },
  async () => {
    const userId = randomUUID(),
      threadId = randomUUID();
    const admissions = await Promise.all(
      Array.from({ length: 12 }, () => call("admit", { userId })),
    );
    assert.equal(new Set(admissions).size, 1);
    const sessionId = admissions[0];
    const appId = await call("app", { userId, sessionId, threadId });
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => call("claim", { sessionId })),
    );
    const first = claims.filter(Boolean);
    assert.equal(first.length, 1);
    await call("settleDebit", { debitId: first[0]._id, outcome: "confirmed" });
    assert.equal(
      await call(
        "allowed",
        { sessionId, userId, now: first[0].paidUntil },
        true,
      ),
      false,
    );
    await call("expire", { sessionId });
    await Promise.all(
      Array.from({ length: 12 }, () =>
        call("boundary", { sessionId, expectedDebit: first[0]._id }),
      ),
    );
    const renewals = await Promise.all(
      Array.from({ length: 12 }, () =>
        call("claim", { sessionId, expectedDebit: first[0]._id }),
      ),
    );
    const second = renewals.filter(Boolean);
    assert.equal(second.length, 1);
    assert.equal((await call("debits", { sessionId }, true)).length, 2);
    await call("crash", { debitId: second[0]._id });
    await call("settleDebit", { debitId: second[0]._id, outcome: "confirmed" });
    assert.equal((await call("get", { sessionId }, true)).state, "hold");
    await assert.rejects(call("admit", { userId }), /reconciliation/);
    assert.equal(
      await call("claim", { sessionId, expectedDebit: first[0]._id }),
      null,
    );
    assert.equal(await call("stop", { sessionId, token: "one" }), true);
    assert.equal(await call("stop", { sessionId, token: "two" }), false);
    await call("stoppedResult", { sessionId, token: "wrong", archived: true });
    assert.equal(
      (await call("get", { sessionId }, true)).stopLease.token,
      "one",
    );
    await call("worker", {
      appId,
      token: "worker",
      expiresAt: Date.now() + 60000,
    });
    await call("stoppedResult", { sessionId, token: "one", archived: true });
    assert.equal(
      (await call("get", { sessionId }, true)).stopConfirmed,
      undefined,
    );
    assert.equal(await call("stop", { sessionId, token: "next" }), true);
    await call("setStatus", { appId, status: "idle" });
    await call("stoppedResult", { sessionId, token: "next", archived: true });
    assert.equal((await call("get", { sessionId }, true)).state, "hold");
    await assert.rejects(call("admit", { userId }), /reconciliation/);

    const other = randomUUID(),
      old = await call("admit", { userId: other });
    const otherApp = await call("app", {
      userId: other,
      sessionId: old,
      threadId: randomUUID(),
    });
    const debit = await call("claim", { sessionId: old });
    await call("settleDebit", { debitId: debit._id, outcome: "denied" });
    await call("stop", { sessionId: old, token: "stop" });
    await call("setStatus", { appId: otherApp, status: "idle" });
    await call("stoppedResult", {
      sessionId: old,
      token: "stop",
      archived: true,
    });
    assert.equal(
      (await call("get", { sessionId: old }, true)).state,
      "stopped",
    );
    assert.notEqual(await call("admit", { userId: other }), old);
  },
);

test(
  "expired worker cannot mutate or issue credentials",
  { skip: !url },
  async () => {
    const userId = randomUUID(),
      threadId = randomUUID(),
      sessionId = await call("admit", { userId });
    const appId = await call("app", { userId, sessionId, threadId });
    const hash =
      randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await call("worker", { appId, token: "old", expiresAt: Date.now() - 1 });
    await assert.rejects(
      call("appendEvents", { id: threadId, token: "old" }),
      /lease expired/,
    );
    await assert.rejects(
      call("issueAccess", { id: threadId, token: "old", hash }),
      /active worker lease/,
    );
    await call("worker", {
      appId,
      token: "new",
      expiresAt: Date.now() + 60000,
    });
    await call("issueAccess", { id: threadId, token: "new", hash });
    assert.ok(await call("auth", { hash }, true));
    await call("expireAccess", { appId });
    assert.equal(await call("auth", { hash }, true), null);
    await call("issueAccess", { id: threadId, token: "new", hash });
    await call("setStatus", { appId, status: "idle" });
    assert.equal(await call("auth", { hash }, true), null);
  },
);
