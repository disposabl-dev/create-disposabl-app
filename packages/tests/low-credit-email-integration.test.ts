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
const config = (changes: object = {}) =>
  call("config", {
    enabled: true,
    environment: "production",
    e2e: "0",
    fail: false,
    ...changes,
  });
const seed = (changes: object = {}) =>
  call("seed", {
    paidUntil: Date.now() + 300000,
    email: "verified@example.invalid",
    ...changes,
  });
const emails = () => call("emails", {}, true);

test(
  "confirmed debit schedules notice, competing calls queue once and failure rolls back for retry",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E === "1" },
  async () => {
    await config();
    const before = (await emails()).length;
    const paid = await seed();
    await call("notify", { debitId: paid.debitId });
    assert.equal((await emails()).length, before);
    await call("settleDebit", {
      debitId: paid.debitId,
      outcome: "confirmed",
      responseBalance: 9,
    });
    const jobs = await call("scheduled", {}, true);
    assert.ok(
      jobs.some(
        (job: any) =>
          job.name === "agent/actions/compute.js:notice" &&
          job.args[0].debitId === paid.debitId,
      ),
    );
    await config({ fail: true });
    await assert.rejects(
      call("notify", { debitId: paid.debitId }),
      /fixture queue failure/,
    );
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeOutcome,
      undefined,
    );
    assert.equal((await emails()).length, before);
    await config();
    await call("deliver", { debitId: paid.debitId, attempt: 1 }, false, true);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        call("notify", { debitId: paid.debitId }),
      ),
    );
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeOutcome,
      "queued",
    );
    const sent = await emails();
    assert.equal(sent.length, before + 1);
    assert.equal(sent[before].to, "verified@example.invalid");
    assert.match(sent[before].text, /add credits and send a new message/i);
    assert.doesNotMatch(
      sent[before].text,
      /unless you add credits|files will be saved/i,
    );
    const direct = {
      userId: paid.userId,
      windowId: paid.debitId,
      paidUntil: (await call("debit", { debitId: paid.debitId }, true))
        .paidUntil,
      balance: 9,
    };
    await Promise.all(
      Array.from({ length: 10 }, () => call("queueDirect", direct)),
    );
    assert.equal((await emails()).length, before + 1);
  },
);

test(
  "threshold, stale and denied debits, missing email and disabled gates do not queue",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E === "1" },
  async () => {
    await config();
    const before = (await emails()).length;
    const threshold = await seed();
    assert.equal(
      await call("actualProductQueue", {
        userId: threshold.userId,
        windowId: threshold.debitId,
        paidUntil: Date.now() + 300000,
        balance: 0,
      }),
      "disabled",
    );
    await call("settleDebit", {
      debitId: threshold.debitId,
      outcome: "confirmed",
      responseBalance: 10,
    });
    await call("notify", { debitId: threshold.debitId });
    const denied = await seed();
    await call("settleDebit", { debitId: denied.debitId, outcome: "denied" });
    await call("notify", { debitId: denied.debitId });
    const stale = await seed();
    await call("settleDebit", {
      debitId: stale.debitId,
      outcome: "confirmed",
      responseBalance: 9,
    });
    await call("expire", { debitId: stale.debitId });
    await call("notify", { debitId: stale.debitId });
    const noEmail = await seed({ email: undefined });
    await call("settleDebit", {
      debitId: noEmail.debitId,
      outcome: "confirmed",
      responseBalance: 9,
    });
    await call("notify", { debitId: noEmail.debitId });
    assert.equal(
      (await call("debit", { debitId: noEmail.debitId }, true)).noticeOutcome,
      "no_verified_email",
    );
    assert.equal(
      (await call("debit", { debitId: stale.debitId }, true)).noticeOutcome,
      "expired",
    );
    assert.equal(
      (await call("debit", { debitId: threshold.debitId }, true)).noticeOutcome,
      "not_low",
    );
    for (const overrides of [
      { enabled: false },
      { environment: "development" },
      { e2e: "1" },
    ]) {
      await config(overrides);
      const gated = await seed();
      await call("settleDebit", {
        debitId: gated.debitId,
        outcome: "confirmed",
        responseBalance: 9,
      });
      await call("notify", { debitId: gated.debitId });
      assert.equal(
        (await call("debit", { debitId: gated.debitId }, true)).noticeOutcome,
        "disabled",
      );
    }
    assert.equal((await emails()).length, before);
  },
);

test(
  "action retries a queue failure with a bound and records final failure",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E === "1" },
  async () => {
    await config({ fail: true });
    const paid = await seed();
    await call("settleDebit", {
      debitId: paid.debitId,
      outcome: "confirmed",
      responseBalance: 9,
    });
    await call("deliver", { debitId: paid.debitId, attempt: 0 }, false, true);
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeOutcome,
      undefined,
    );
    const jobs = await call("scheduled", {}, true);
    assert.ok(
      jobs.some(
        (job: any) =>
          job.name === "agent/actions/compute.js:notice" &&
          job.args[0].debitId === paid.debitId &&
          job.args[0].attempt === 1,
      ),
    );
    await call("deliver", { debitId: paid.debitId, attempt: 5 }, false, true);
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeOutcome,
      "failed",
    );
  },
);

test(
  "backend E2E environment prevents queueing even with fixture production enabled",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E !== "1" },
  async () => {
    await config();
    const before = (await emails()).length;
    const paid = await seed();
    await call("settleDebit", {
      debitId: paid.debitId,
      outcome: "confirmed",
      responseBalance: 9,
    });
    await call("deliver", { debitId: paid.debitId, attempt: 0 }, false, true);
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeOutcome,
      "disabled",
    );
    assert.equal((await emails()).length, before);
  },
);

test(
  "fund action persists the synthetic HTTP response before notice action",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E === "1" },
  async () => {
    await config();
    const before = (await emails()).length;
    const seeded = await call("seedUnclaimed");
    await call(
      "fundFixture",
      { sessionId: seeded.sessionId, responseBalance: 4 },
      false,
      true,
    );
    const session = await call(
      "session",
      { sessionId: seeded.sessionId },
      true,
    );
    const debit = await call("debit", { debitId: session.debitId }, true);
    assert.equal(debit.state, "confirmed");
    assert.equal(debit.responseBalance, 4);
    await call("deliver", { debitId: debit._id, attempt: 0 }, false, true);
    assert.equal(
      (await call("debit", { debitId: debit._id }, true)).noticeOutcome,
      "queued",
    );
    assert.equal((await emails()).length, before + 1);
  },
);

test(
  "deletion eligibility fences settled notices and inert enqueue transactionally",
  { skip: !url || process.env.LOW_CREDIT_BACKEND_E2E !== "1" },
  async () => {
    await config();
    const pending = await seed();
    const missing = await seed();
    const active = await seed();
    for (const record of [pending, missing, active])
      await call("settleDebit", {
        debitId: record.debitId,
        outcome: "confirmed",
        responseBalance: 9,
      });
    await call("requestDeletion", { userId: pending.userId });
    await call("removeSyntheticUser", { userId: missing.userId });
    const args = (record: any) => ({
      userId: record.userId,
      windowId: record.debitId,
      paidUntil: Date.now() + 300000,
      balance: 9,
    });
    assert.equal(
      await call("actualProductQueue", args(pending)),
      "account_ineligible",
    );
    assert.equal(
      await call("actualProductQueue", args(missing)),
      "account_ineligible",
    );
    assert.equal(await call("actualProductQueue", args(active)), "disabled");
    for (const record of [pending, missing, active])
      await call("notify", { debitId: record.debitId });
    assert.equal(
      (await call("debit", { debitId: pending.debitId }, true)).noticeOutcome,
      "account_ineligible",
    );
    assert.equal(
      (await call("debit", { debitId: missing.debitId }, true)).noticeOutcome,
      "account_ineligible",
    );
    assert.equal(
      (await call("debit", { debitId: active.debitId }, true)).noticeOutcome,
      "disabled",
    );
    for (const record of [pending, missing, active]) {
      const debit = await call("debit", { debitId: record.debitId }, true);
      assert.equal(debit.state, "confirmed");
      assert.equal(debit.responseBalance, 9);
      await call("notify", { debitId: record.debitId });
    }
    const before = (await emails()).length;
    assert.equal(
      await call("enqueueInert", { userId: pending.userId, key: "pending" }),
      "account_ineligible",
    );
    assert.equal(
      await call("enqueueInert", { userId: missing.userId, key: "missing" }),
      "account_ineligible",
    );
    assert.equal(
      await call("enqueueInert", { userId: active.userId, key: "active" }),
      "queued",
    );
    const racing = await seed();
    const [race] = await Promise.all([
      call("enqueueInert", { userId: racing.userId, key: "racing" }),
      call("requestDeletion", { userId: racing.userId }),
    ]);
    assert.ok(["queued", "account_ineligible"].includes(race));
    assert.equal(
      await call("enqueueInert", { userId: racing.userId, key: "late" }),
      "account_ineligible",
    );
    assert.equal(
      (await emails()).length,
      before + 1 + (race === "queued" ? 1 : 0),
    );
  },
);
