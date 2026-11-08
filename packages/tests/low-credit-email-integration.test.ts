import { test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.LOW_CREDIT_FIXTURE_URL;
if (url && !["http://127.0.0.1:3480", "http://localhost:3480"].includes(url))
  throw new Error("Low-credit fixture requires loopback port 3480");
async function call(name: string, args: object = {}, query = false) {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
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
  { skip: !url },
  async () => {
    await config();
    const before = (await emails()).length;
    const paid = await seed();
    await call("notify", { debitId: paid.debitId, balance: 9 });
    assert.equal((await emails()).length, before);
    await call("settleDebit", { debitId: paid.debitId, outcome: "confirmed" });
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
      call("notify", { debitId: paid.debitId, balance: 9 }),
      /fixture queue failure/,
    );
    assert.notEqual(
      (await call("debit", { debitId: paid.debitId }, true)).noticeComplete,
      true,
    );
    assert.equal((await emails()).length, before);
    await config();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        call("notify", { debitId: paid.debitId, balance: 9 }),
      ),
    );
    assert.equal(
      (await call("debit", { debitId: paid.debitId }, true)).noticeComplete,
      true,
    );
    const sent = await emails();
    assert.equal(sent.length, before + 1);
    assert.equal(sent[before].to, "verified@example.invalid");
    assert.match(sent[before].text, /files will be saved/i);
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
  { skip: !url },
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
    });
    await call("notify", { debitId: threshold.debitId, balance: 10 });
    const denied = await seed();
    await call("settleDebit", { debitId: denied.debitId, outcome: "denied" });
    await call("notify", { debitId: denied.debitId, balance: 0 });
    const stale = await seed();
    await call("settleDebit", { debitId: stale.debitId, outcome: "confirmed" });
    await call("expire", { debitId: stale.debitId });
    await call("notify", { debitId: stale.debitId, balance: 0 });
    const noEmail = await seed({ email: undefined });
    await call("settleDebit", {
      debitId: noEmail.debitId,
      outcome: "confirmed",
    });
    await call("notify", { debitId: noEmail.debitId, balance: 0 });
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
      });
      await call("notify", { debitId: gated.debitId, balance: 0 });
    }
    assert.equal((await emails()).length, before);
  },
);
