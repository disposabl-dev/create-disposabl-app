import { test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.LOW_CREDIT_FIXTURE_URL;
if (url && !["http://127.0.0.1:3480", "http://localhost:3480"].includes(url))
  throw new Error("Low-credit fixture requires loopback port 3480");
async function call(
  name: string,
  args: object = {},
  query = false,
  action = false,
) {
  const response = await fetch(
    `${url}/api/${action ? "action" : query ? "query" : "mutation"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
    },
  );
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? "Fixture request failed");
  return result.value;
}
const skip = !url || process.env.LOW_CREDIT_BACKEND_E2E !== "1";
const seed = () =>
  call("seed", {
    paidUntil: Date.now() + 300000,
    email: "verified@example.invalid",
  });
const debit = (debitId: string) => call("debit", { debitId }, true);
const reads = (debitId: string) => call("reads", { debitId }, true);
const emails = () => call("emails", {}, true);
const settle = (debitId: string, responseBalance: number) =>
  call("settleDebit", { debitId, outcome: "confirmed", responseBalance });
const deliver = (debitId: string, balance: number, mode = "ok", attempt = 0) =>
  call("deliverInert", { debitId, attempt, balance, mode }, false, true);

// The action options and queue are test-only injections. The backend E2E flag
// remains enabled, the real product queue stays disabled, and markers are not emails.
test(
  "funding preserves its raw debit response through a later observation",
  { skip },
  async () => {
    const record = await call("seedUnclaimed");
    await call(
      "fundFixture",
      { sessionId: record.sessionId, responseBalance: 4 },
      false,
      true,
    );
    const session = await call(
      "session",
      { sessionId: record.sessionId },
      true,
    );
    const before = await debit(session.debitId);
    assert.equal(before.state, "confirmed");
    assert.equal(before.responseBalance, 4);
    await deliver(session.debitId, 20);
    const after = await debit(session.debitId);
    assert.equal(after.responseBalance, 4);
    assert.equal(after.noticeBalance, 20);
    assert.equal(after.noticeOutcome, "not_low");
  },
);

test(
  "fresh observation controls inert decisions and duplicates never add a second marker",
  { skip },
  async () => {
    const before = (await emails()).length;
    const low = await seed();
    await settle(low.debitId, 10);
    await Promise.all(Array.from({ length: 8 }, () => deliver(low.debitId, 0)));
    const row = await debit(low.debitId);
    assert.equal(row.state, "confirmed");
    assert.equal(row.responseBalance, 10);
    assert.equal(row.noticeBalance, 0);
    assert.equal(row.noticeOutcome, "queued");
    assert.ok(row.noticeObservedAt > 0);
    const entries = await reads(low.debitId);
    assert.ok(entries.length >= 1);
    assert.ok(
      entries.every(
        (entry: any) => entry.method === "balances.check" && entry.nonConsuming,
      ),
    );
    assert.equal((await emails()).length, before + 1);
    const count = entries.length;
    await deliver(low.debitId, 0);
    assert.equal((await reads(low.debitId)).length, count);
    assert.equal((await emails()).length, before + 1);

    const high = await seed();
    await settle(high.debitId, 0);
    await deliver(high.debitId, 20);
    const highRow = await debit(high.debitId);
    assert.equal(highRow.responseBalance, 0);
    assert.equal(highRow.noticeBalance, 20);
    assert.equal(highRow.noticeOutcome, "not_low");
    assert.equal((await emails()).length, before + 1);
  },
);

test(
  "failed or malformed reads leave confirmed debit intact and retry only the observation",
  { skip },
  async () => {
    for (const mode of ["http-error", "malformed"]) {
      const before = (await emails()).length;
      const record = await seed();
      await settle(record.debitId, 10);
      await deliver(record.debitId, 0, mode);
      const failedRead = await debit(record.debitId);
      assert.equal(failedRead.state, "confirmed");
      assert.equal(failedRead.responseBalance, 10);
      assert.equal(failedRead.noticeOutcome, undefined);
      assert.equal(failedRead.noticeBalance, undefined);
      const jobs = await call("scheduled", {}, true);
      assert.ok(
        jobs.some(
          (job: any) =>
            job.name === "agent/actions/compute.js:notice" &&
            job.args[0].debitId === record.debitId &&
            job.args[0].attempt === 1,
        ),
      );
      await deliver(record.debitId, 0, "ok", 1);
      const final = await debit(record.debitId);
      assert.equal(final.state, "confirmed");
      assert.equal(final.responseBalance, 10);
      assert.equal(final.noticeBalance, 0);
      assert.equal(final.noticeOutcome, "queued");
      const entries = await reads(record.debitId);
      assert.equal(entries.length, 2);
      assert.ok(
        entries.every(
          (entry: any) =>
            entry.method === "balances.check" && entry.nonConsuming,
        ),
      );
      assert.equal((await emails()).length, before + 1);
    }
  },
);

test(
  "pending or missing owners do not read and expiry during the read cannot queue",
  { skip },
  async () => {
    const before = (await emails()).length;
    for (const mode of ["pending", "missing"]) {
      const record = await seed();
      await settle(record.debitId, 10);
      await call(
        mode === "pending" ? "requestDeletion" : "removeSyntheticUser",
        { userId: record.userId },
      );
      await deliver(record.debitId, 0);
      assert.equal(
        (await debit(record.debitId)).noticeOutcome,
        "account_ineligible",
      );
      assert.equal((await reads(record.debitId)).length, 0);
    }
    const expiring = await seed();
    await settle(expiring.debitId, 10);
    await deliver(expiring.debitId, 0, "expire");
    const row = await debit(expiring.debitId);
    assert.equal(row.noticeOutcome, "expired");
    assert.equal(row.responseBalance, 10);
    assert.equal(row.noticeBalance, undefined);
    assert.equal((await reads(expiring.debitId)).length, 1);
    assert.equal((await emails()).length, before);
  },
);

test(
  "registered action and actual product queue stay disabled by backend E2E",
  { skip },
  async () => {
    const before = (await emails()).length;
    const record = await seed();
    await settle(record.debitId, 0);
    const paid = await debit(record.debitId);
    assert.equal(
      await call("actualProductQueue", {
        userId: record.userId,
        windowId: record.debitId,
        paidUntil: paid.paidUntil,
        balance: 0,
      }),
      "disabled",
    );
    await call("deliver", { debitId: record.debitId, attempt: 0 }, false, true);
    assert.equal((await debit(record.debitId)).noticeOutcome, "disabled");
    assert.equal((await reads(record.debitId)).length, 0);
    assert.equal((await emails()).length, before);
  },
);

test(
  "initial debit read failure schedules a bounded retry",
  { skip },
  async () => {
    const record = await seed();
    await settle(record.debitId, 10);
    await assert.doesNotReject(
      call(
        "deliverInitialReadFailure",
        { debitId: record.debitId, attempt: 0 },
        false,
        true,
      ),
    );
    const row = await debit(record.debitId);
    assert.equal(row.state, "confirmed");
    assert.equal(row.noticeOutcome, undefined);
    const jobs = await call("scheduled", {}, true);
    assert.ok(
      jobs.some(
        (job: any) =>
          job.name === "agent/actions/compute.js:notice" &&
          job.args[0].debitId === record.debitId &&
          job.args[0].attempt === 1,
      ),
    );
  },
);

test(
  "an exhausted read failure cannot suppress a concurrent successful observation",
  { skip },
  async () => {
    const before = (await emails()).length;
    const record = await seed();
    await settle(record.debitId, 10);
    const successful = deliver(record.debitId, 0, "hold");
    try {
      let started = false;
      for (let i = 0; i < 100 && !started; i++) {
        started = (await reads(record.debitId)).some(
          (entry: any) => entry.method === "balances.check",
        );
        if (!started) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        started,
        true,
        "successful observation did not reach the barrier",
      );
      await deliver(record.debitId, 0, "http-error", 5);
    } finally {
      await call("releaseRead", { debitId: record.debitId });
      await successful;
    }
    const row = await debit(record.debitId);
    assert.equal(row.state, "confirmed");
    assert.equal(row.responseBalance, 10);
    assert.equal(row.noticeOutcome, "queued");
    assert.equal(row.noticeBalance, 0);
    assert.equal((await emails()).length, before + 1);
  },
);

test(
  "exhausted failure finalizes once at the paid deadline without reading or queueing",
  { skip },
  async () => {
    const before = (await emails()).length;
    const paidUntil = Date.now() + 2000;
    const record = await call("seed", {
      paidUntil,
      email: "verified@example.invalid",
    });
    await settle(record.debitId, 10);
    await deliver(record.debitId, 0, "http-error", 5);
    assert.equal((await debit(record.debitId)).noticeOutcome, undefined);
    const finalizers = (jobs: any[]) =>
      jobs.filter(
        (job: any) =>
          job.name === "agent/compute.js:notice" &&
          job.args[0].debitId === record.debitId &&
          job.args[0].failed === true,
      );
    const scheduled = finalizers(await call("scheduled", {}, true));
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].scheduledTime, paidUntil);
    let row;
    for (let i = 0; i < 100; i++) {
      row = await debit(record.debitId);
      if (row.noticeOutcome === "expired") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(row.noticeOutcome, "expired");
    assert.equal(row.responseBalance, 10);
    assert.equal(row.noticeBalance, undefined);
    assert.equal((await reads(record.debitId)).length, 1);
    assert.equal((await emails()).length, before);
    await call("notify", { debitId: record.debitId, failed: true });
    assert.equal(finalizers(await call("scheduled", {}, true)).length, 1);
    assert.equal((await reads(record.debitId)).length, 1);
    assert.equal((await emails()).length, before);
  },
);
