import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
const base = process.env.LOW_CREDIT_ELAPSED_URL;
if (base && base !== "http://127.0.0.1:3480")
  throw new Error("Requires owned loopback backend 3480");
const skip = !base || process.env.LOW_CREDIT_ELAPSED !== "1";
async function call(
  kind: "query" | "mutation" | "action",
  path: string,
  args: object = {},
) {
  const response = await fetch(`${base}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(`${path} failed: ${result.errorMessage ?? "unknown"}`);
  return result.value;
}
const q = (name: string, args: object = {}) =>
  call("query", `fixture:${name}`, args);
const m = (name: string, args: object = {}) =>
  call("mutation", `fixture:${name}`, args);
const a = (name: string, args: object = {}) =>
  call("action", `fixture:${name}`, args);

test(
  "two real funded windows renew once and stop on the following denied debit",
  { skip, timeout: 1_320_000 },
  async () => {
    const { userId, sessionId } = await m("seedUnclaimed");
    const startedWall = Date.now(),
      startedMono = performance.now();
    await a("fundFixture", { sessionId, responseBalance: 20 });
    const first = await q("session", { sessionId });
    const firstDebit = await q("debit", { debitId: first.debitId });
    assert.equal(first.state, "active");
    assert.equal(firstDebit.state, "confirmed");
    assert.ok(
      first.paidUntil >= startedWall + 600_000 &&
        first.paidUntil <= Date.now() + 600_000,
    );
    let lastProgress = 0;
    async function waitForBoundary(
      deadline: number,
      oldDebit: string,
      count: number,
    ) {
      for (;;) {
        const now = Date.now();
        const session = await q("session", { sessionId });
        const charges = await call("query", "elapsedFixture:charges", {
          userId,
        });
        if (now < deadline) {
          assert.equal(
            charges.length,
            count - 1,
            "charged before funded deadline",
          );
          assert.equal(
            session.debitId,
            oldDebit,
            "changed debit before funded deadline",
          );
          assert.equal(
            session.state,
            "active",
            "stopped before funded deadline",
          );
        }
        if (
          charges.length >= count &&
          session.debitId !== oldDebit &&
          session.state !== "renewing"
        ) {
          assert.ok(
            charges[count - 1].observedAt >= deadline,
            "charge began before deadline",
          );
          return { session, charges, wall: now, mono: performance.now() };
        }
        if (now > deadline + 30_000)
          throw new Error(
            "Scheduled boundary did not settle within 30 seconds",
          );
        if (performance.now() - lastProgress >= 60_000) {
          console.log(
            `elapsed ${Math.floor((performance.now() - startedMono) / 1000)}s, completed renewals ${charges.length}`,
          );
          lastProgress = performance.now();
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    const renewed = await waitForBoundary(first.paidUntil, first.debitId, 1);
    assert.ok(renewed.mono - startedMono >= 600_000);
    const second = renewed.session;
    const secondDebit = await q("debit", { debitId: second.debitId });
    assert.equal(second.state, "active");
    assert.equal(secondDebit.state, "confirmed");
    assert.equal(secondDebit.responseBalance, 4);
    assert.equal(second.paidUntil, secondDebit.paidUntil);
    assert.ok(second.paidUntil >= renewed.charges[0].observedAt + 600_000);
    assert.equal(await q("allowed", { sessionId, userId }), true);
    let markers = await q("emails");
    for (let i = 0; i < 20 && markers.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      markers = await q("emails");
    }
    assert.equal(markers.length, 1);
    assert.equal(
      (await q("debit", { debitId: second.debitId })).noticeOutcome,
      "queued",
    );
    assert.equal(
      await m("actualProductQueue", {
        userId,
        windowId: second.debitId,
        paidUntil: second.paidUntil,
        balance: 4,
      }),
      "disabled",
    );
    const stopped = await waitForBoundary(second.paidUntil, second.debitId, 2);
    assert.ok(stopped.mono - startedMono >= 1_200_000);
    assert.ok(
      stopped.charges[1].observedAt - renewed.charges[0].observedAt >= 600_000,
    );
    const finalDebit = await q("debit", { debitId: stopped.session.debitId });
    assert.equal(finalDebit.state, "denied");
    assert.ok(["stopping", "stopped"].includes(stopped.session.state));
    assert.equal(await q("allowed", { sessionId, userId }), false);
    assert.equal((await q("emails")).length, 1);
    console.log(
      JSON.stringify({
        initialDebit: first.debitId,
        renewalDebit: second.debitId,
        deniedDebit: stopped.session.debitId,
        firstDeadline: first.paidUntil,
        secondDeadline: second.paidUntil,
        firstObservedAt: renewed.charges[0].observedAt,
        secondObservedAt: stopped.charges[1].observedAt,
        elapsedFirstMs: Math.round(renewed.mono - startedMono),
        elapsedTotalMs: Math.round(stopped.mono - startedMono),
        endedAt: stopped.wall,
      }),
    );
  },
);
