import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Only run against the separate, disposable fixture deployment; never the app backend.
const url = process.env.COMPUTE_FIXTURE_URL;
if (
  url &&
  ![
    "http://127.0.0.1:3420",
    "http://localhost:3420",
    "http://127.0.0.1:3520",
    "http://localhost:3520",
  ].includes(url)
)
  throw new Error(
    "Compute fixture requires the isolated loopback deployment on port 3420 or 3520",
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
    const secondDebit = await call("inFlightRenewal", { sessionId });
    const second = [secondDebit];
    await call("expire", { sessionId });
    assert.equal((await call("debits", { sessionId }, true)).length, 2);
    await call("crash", { debitId: second[0]._id });
    const resolution = {
      sessionId,
      debitId: second[0]._id,
      outcome: "confirmed",
      evidence: "provider ledger immutable reference 123",
      operator: "operator-1",
    };
    await assert.rejects(call("resolveHold", resolution), /Normal stop/);
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

    await assert.rejects(
      call("resolveHold", { ...resolution, debitId: first[0]._id }),
      /match/,
    );
    await assert.rejects(
      call("resolveHold", { ...resolution, evidence: " " }),
      /evidence/,
    );
    await call("worker", {
      appId,
      token: "late",
      expiresAt: Date.now() + 60000,
    });
    await assert.rejects(call("resolveHold", resolution), /Worker leases/);
    await call("setStatus", { appId, status: "idle" });
    const before = await call("get", { sessionId }, true);
    const results = await Promise.allSettled([
      ...Array.from({ length: 8 }, () => call("resolveHold", resolution)),
      ...Array.from({ length: 8 }, () => call("admit", { userId })),
    ]);
    assert.equal(
      results.slice(0, 8).filter((r) => r.status === "fulfilled").length,
      1,
    );
    const next = await call("admit", { userId });
    assert.notEqual(next, sessionId);
    for (const result of results.slice(8)) {
      if (result.status === "fulfilled") assert.equal(result.value, next);
    }
    await call("app", { userId, sessionId: next, threadId: randomUUID() });
    const nextDebit = await call("claim", { sessionId: next });
    assert.ok(nextDebit);
    assert.notEqual(nextDebit._id, second[0]._id);
    const after = await call("get", { sessionId }, true);
    assert.equal(after.state, "stopped");
    assert.equal(after.paidUntil, before.paidUntil);
    const recorded = (await call("debits", { sessionId }, true)).find(
      (d: any) => d._id === second[0]._id,
    );
    assert.equal(recorded.state, "unknown");
    assert.equal(recorded.paidUntil, second[0].paidUntil);
    assert.equal(recorded.resolution.outcome, "confirmed");
    assert.equal(recorded.resolution.evidence, resolution.evidence);
    await assert.rejects(call("resolveHold", resolution), /stale|resolved/);
    await call("settleDebit", { debitId: second[0]._id, outcome: "denied" });
    assert.equal(
      (await call("get", { sessionId: next }, true)).state,
      "starting",
    );

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
  "a provider-denied debit is recorded without granting paid time",
  { skip: !url },
  async () => {
    const userId = randomUUID();
    const sessionId = await call("admit", { userId });
    const appId = await call("app", {
      userId,
      sessionId,
      threadId: randomUUID(),
    });
    const debit = await call("claim", { sessionId });
    await call("crash", { debitId: debit._id });
    await call("stop", { sessionId, token: "stop" });
    await call("setStatus", { appId, status: "idle" });
    await call("stoppedResult", { sessionId, token: "stop", archived: true });
    await call("resolveHold", {
      sessionId,
      debitId: debit._id,
      outcome: "denied",
      evidence: "final provider denial 456",
      operator: "operator-1",
    });
    const row = (await call("debits", { sessionId }, true))[0];
    assert.equal(row.state, "unknown");
    assert.equal(row.resolution.outcome, "denied");
    assert.equal((await call("get", { sessionId }, true)).paidUntil, 0);
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

test(
  "same-app recovery drains old messages before either delayed-tick ordering",
  { skip: !url },
  async () => {
    for (const tickBeforeMessage of [true, false]) {
      const userId = randomUUID();
      const sessionId = await call("admit", { userId });
      const app = await call("queuedApp", { userId, sessionId });
      const debit = await call("claim", { sessionId });
      await call("crash", { debitId: debit._id });
      await call("stop", { sessionId, token: "stop" });
      await call("stoppedResult", { sessionId, token: "stop", archived: true });
      const resolution = {
        sessionId,
        debitId: debit._id,
        outcome: "denied",
        evidence: "Final provider denial, no request remains in flight",
        operator: "fixture",
      };
      await assert.rejects(
        call("resolveHold", resolution),
        /Old work must finish/,
      );
      await call("claimWorkerLease", { id: app.threadId, token: "old" });
      await assert.rejects(
        call("resolveHold", resolution),
        /leases must drain/,
      );
      await call("suspendWorker", { id: app.threadId, token: "old" });
      const [old] = await call("messages", { ids: [app.messageId] }, true);
      assert.equal(old.status, "failed");
      await call("resolveHold", resolution);
      if (tickBeforeMessage)
        assert.equal(
          await call("claimWorkerLease", {
            id: app.threadId,
            token: "delayed",
          }),
          null,
        );
      const next = await call("enqueueSameApp", { id: app.threadId });
      assert.notEqual(next.sessionId, sessionId);
      const claimed = await call("claimWorkerLease", {
        id: app.threadId,
        token: "delayed",
      });
      assert.equal(claimed.computeSessionId, next.sessionId);
      assert.deepEqual(claimed.pending, [next.messageId]);
      await assert.rejects(
        call("suspendWorker", { id: app.threadId, token: "old" }),
        /lease expired/,
      );
      const [fresh] = await call("messages", { ids: [next.messageId] }, true);
      assert.notEqual(fresh.status, "failed");
      await call("suspendWorker", { id: app.threadId, token: "delayed" });
    }
  },
);

test(
  "session rebind rejects undrained work even after a denied debit's stop",
  { skip: !url },
  async () => {
    const userId = randomUUID();
    const sessionId = await call("admit", { userId });
    const app = await call("queuedApp", { userId, sessionId });
    const debit = await call("claim", { sessionId });
    await call("settleDebit", { debitId: debit._id, outcome: "denied" });
    await call("stop", { sessionId, token: "stop" });
    await call("stoppedResult", { sessionId, token: "stop", archived: true });
    await assert.rejects(
      call("enqueueSameApp", { id: app.threadId }),
      /still stopping/,
    );
    await call("claimWorkerLease", { id: app.threadId, token: "old" });
    await assert.rejects(
      call("enqueueSameApp", { id: app.threadId }),
      /still stopping/,
    );
    await call("suspendWorker", { id: app.threadId, token: "old" });
    const next = await call("enqueueSameApp", { id: app.threadId });
    assert.notEqual(next.sessionId, sessionId);
    await assert.rejects(
      call("suspendWorker", { id: app.threadId, token: "old" }),
      /lease expired/,
    );
  },
);

test(
  "late confirmed renewal holds old work through stop and manual recovery",
  { skip: !url },
  async () => {
    const userId = randomUUID();
    const sessionId = await call("admit", { userId });
    const app = await call("queuedApp", { userId, sessionId });
    const first = await call("claim", { sessionId });
    await call("settleDebit", { debitId: first._id, outcome: "confirmed" });
    const late = await call("inFlightRenewal", { sessionId });
    await call("expire", { sessionId });
    const expiredDeadline = (await call("get", { sessionId }, true)).paidUntil;
    const results = await Promise.allSettled([
      ...Array.from({ length: 8 }, () =>
        call("settleDebit", {
          debitId: late._id,
          outcome: "confirmed",
          responseBalance: 2,
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        call("enqueueSameApp", { id: app.threadId }),
      ),
    ]);
    assert.ok(results.slice(8).every((result) => result.status === "rejected"));
    const held = await call("get", { sessionId }, true);
    assert.equal(held.state, "hold");
    assert.equal(held.paidUntil, expiredDeadline);
    assert.equal(
      await call("allowed", { sessionId, userId, now: Date.now() }, true),
      false,
    );
    const debits = await call("debits", { sessionId }, true);
    assert.equal(
      debits.find((d: any) => d._id === late._id).state,
      "confirmed",
    );
    assert.equal(
      debits.find((d: any) => d._id === late._id).paidUntil,
      late.paidUntil,
    );
    assert.equal(
      debits.find((d: any) => d._id === late._id).responseBalance,
      2,
    );
    const resolution = {
      sessionId,
      debitId: late._id,
      outcome: "confirmed",
      evidence: "Provider confirmed final debit, no dispatch remains",
      operator: "fixture",
    };
    await assert.rejects(call("resolveHold", resolution), /Normal stop/);
    await call("stop", { sessionId, token: "stop" });
    await call("stoppedResult", { sessionId, token: "stop", archived: true });
    await assert.rejects(
      call("resolveHold", { ...resolution, outcome: "denied" }),
      /cannot be resolved as denied/,
    );
    await assert.rejects(
      call("resolveHold", resolution),
      /Old work must finish/,
    );
    await call("claimWorkerLease", { id: app.threadId, token: "old" });
    await call("suspendWorker", { id: app.threadId, token: "old" });
    assert.equal(
      (await call("messages", { ids: [app.messageId] }, true))[0].status,
      "failed",
    );
    await call("resolveHold", resolution);
    const fresh = await call("enqueueSameApp", { id: app.threadId });
    assert.notEqual(fresh.sessionId, sessionId);
    await call("settleDebit", {
      debitId: late._id,
      outcome: "confirmed",
      responseBalance: 2,
    });
    const worker = await call("claimWorkerLease", {
      id: app.threadId,
      token: "new",
    });
    assert.equal(worker.computeSessionId, fresh.sessionId);
    assert.deepEqual(worker.pending, [fresh.messageId]);
    await assert.rejects(
      call("suspendWorker", { id: app.threadId, token: "old" }),
      /lease expired/,
    );
  },
);

test(
  "expired active window stops without dispatching another debit",
  { skip: !url },
  async () => {
    const userId = randomUUID();
    const sessionId = await call("admit", { userId });
    await call("app", { userId, sessionId, threadId: randomUUID() });
    const first = await call("claim", { sessionId });
    await call("settleDebit", { debitId: first._id, outcome: "confirmed" });
    await call("expire", { sessionId });
    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        call("claim", { sessionId, expectedDebit: first._id }),
      ),
    );
    assert.ok(claims.every((claim) => claim === null));
    assert.equal((await call("debits", { sessionId }, true)).length, 1);
    assert.equal((await call("get", { sessionId }, true)).state, "stopping");
  },
);

test(
  "stop confirmation cannot release an in-flight debit",
  { skip: !url },
  async () => {
    for (const outcome of ["confirmed", "denied"] as const) {
      const userId = randomUUID();
      const sessionId = await call("admit", { userId });
      const appId = await call("app", {
        userId,
        sessionId,
        threadId: randomUUID(),
      });
      const debit = await call("claim", { sessionId });
      await call("beginStop", { sessionId });
      await call("stop", { sessionId, token: "stop" });
      await call("setStatus", { appId, status: "idle" });
      await call("stoppedResult", { sessionId, token: "stop", archived: true });
      assert.equal((await call("get", { sessionId }, true)).state, "hold");
      await assert.rejects(call("admit", { userId }), /reconciliation/);
      await call("settleDebit", { debitId: debit._id, outcome });
      const session = await call("get", { sessionId }, true);
      assert.equal(session.state, outcome === "confirmed" ? "hold" : "stopped");
      assert.equal(
        (await call("debits", { sessionId }, true))[0].state,
        outcome,
      );
      if (outcome === "confirmed")
        await assert.rejects(call("admit", { userId }), /reconciliation/);
      else assert.notEqual(await call("admit", { userId }), sessionId);
    }
  },
);

test(
  "timeout, operator denial and late confirmation serialize without erasing evidence",
  { skip: !url },
  async () => {
    for (const ordering of [
      "confirm-first",
      "denial-first",
      "race",
      "new-session",
      "new-session-dispatch",
    ]) {
      const userId = randomUUID();
      const sessionId = await call("admit", { userId });
      const appId = await call("app", {
        userId,
        sessionId,
        threadId: randomUUID(),
      });
      const debit = await call("claim", { sessionId });
      await call("crash", { debitId: debit._id });
      await call("stop", { sessionId, token: "stop" });
      await call("setStatus", { appId, status: "idle" });
      await call("stoppedResult", { sessionId, token: "stop", archived: true });
      const denial = {
        sessionId,
        debitId: debit._id,
        outcome: "denied",
        operator: "fixture",
        evidence: "provider denial reference",
      };
      const confirm = {
        debitId: debit._id,
        outcome: "confirmed",
        responseBalance: 3,
      };
      let next: string | undefined;
      let nextDebitId: string | undefined;
      if (ordering === "confirm-first") {
        await call("settleDebit", confirm);
        await assert.rejects(
          call("resolveHold", denial),
          /cannot be resolved as denied/,
        );
      } else if (ordering === "race") {
        await Promise.allSettled([
          call("settleDebit", confirm),
          call("resolveHold", denial),
        ]);
      } else {
        await call("resolveHold", denial);
        if (ordering === "new-session" || ordering === "new-session-dispatch") {
          next = await call("admit", { userId });
          await call("app", {
            userId,
            sessionId: next,
            threadId: randomUUID(),
          });
          const nextDebit = await call("claim", { sessionId: next });
          nextDebitId = nextDebit._id;
          if (ordering === "new-session") {
            await call("settleDebit", {
              debitId: nextDebitId,
              outcome: "confirmed",
            });
            assert.equal(
              (await call("get", { sessionId: next }, true)).state,
              "active",
            );
          }
        }
        await call("settleDebit", confirm);
      }
      const before = (await call("debits", { sessionId }, true))[0];
      assert.equal(before.state, "unknown");
      assert.equal(before.lateConfirmation.responseBalance, 3);
      assert.ok(before.lateConfirmation.observedAt);
      const conflict = Boolean(before.resolution);
      if (conflict) {
        assert.equal(before.resolution.outcome, "denied");
        assert.equal(before.resolution.evidence, denial.evidence);
        assert.equal(before.reconciliationConflict, true);
        const current = await call(
          "get",
          { sessionId: next ?? sessionId },
          true,
        );
        assert.equal(current.state, "hold");
        assert.equal(current.reconciliationConflict, true);
        if (ordering === "new-session-dispatch") {
          await call("settleDebit", {
            debitId: nextDebitId,
            outcome: "denied",
          });
          assert.equal(
            (await call("get", { sessionId: next }, true)).state,
            "hold",
          );
        }
        assert.equal(
          await call(
            "allowed",
            { sessionId: next ?? sessionId, userId, now: Date.now() },
            true,
          ),
          false,
        );
        await assert.rejects(call("admit", { userId }), /reconciliation/);
        if (!next)
          await assert.rejects(
            call("resolveHold", { ...denial, outcome: "confirmed" }),
            /already resolved|contradictory/,
          );
      } else {
        assert.equal(before.reconciliationConflict, undefined);
        assert.equal((await call("get", { sessionId }, true)).state, "hold");
        await assert.rejects(
          call("resolveHold", denial),
          /cannot be resolved as denied/,
        );
      }
      await Promise.all(
        Array.from({ length: 5 }, () =>
          call("settleDebit", { ...confirm, responseBalance: 99 }),
        ),
      );
      const after = (await call("debits", { sessionId }, true))[0];
      assert.deepEqual(after.lateConfirmation, before.lateConfirmation);
      assert.deepEqual(after.resolution, before.resolution);
    }
  },
);
