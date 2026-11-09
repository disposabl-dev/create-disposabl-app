import { test } from "node:test";
import assert from "node:assert/strict";
import { queueLowCreditNotice } from "../backend/convex/product/lowCreditEmail";

const notice = {
  userId: "user",
  windowId: "window-1",
  paidUntil: Date.UTC(2027, 0, 1),
  balance: 9,
};
function fixture() {
  const messages: any[] = [];
  let lookups = 0;
  const options = {
    enabled: true,
    environment: "production",
    e2e: "0",
    sender: "Product <mail@example.com>",
    apiKey: "resend-key",
    paymentUrl: "https://example.com/pricing",
    getVerifiedEmail: async () => {
      lookups++;
      return "verified@example.com";
    },
    enqueue: async (message: any) => {
      messages.push(message);
    },
  };
  return { options, messages, lookups: () => lookups };
}

test("queues the paid-window warning with a stable per-user window key", async () => {
  const f = fixture();
  assert.equal(await queueLowCreditNotice(notice, f.options), "queued");
  assert.equal(await queueLowCreditNotice(notice, f.options), "queued");
  assert.equal(f.messages[0].idempotencyKey, f.messages[1].idempotencyKey);
  assert.match(f.messages[0].text, /2027-01-01T00:00:00.000Z/);
  assert.match(f.messages[0].text, /add credits and send a new message/i);
  assert.doesNotMatch(
    f.messages[0].text,
    /unless you add credits|files will be saved/i,
  );
  assert.match(f.messages[0].text, /https:\/\/example.com\/pricing/);
  assert.equal(f.messages[0].to, "verified@example.com");
  await queueLowCreditNotice({ ...notice, windowId: "window-2" }, f.options);
  await queueLowCreditNotice({ ...notice, userId: "other" }, f.options);
  assert.notEqual(f.messages[0].idempotencyKey, f.messages[2].idempotencyKey);
  assert.notEqual(f.messages[0].idempotencyKey, f.messages[3].idempotencyKey);
});

test("never queues outside production, in E2E, when disabled, or at the threshold", async () => {
  const f = fixture();
  for (const overrides of [
    { enabled: false },
    { environment: "development" },
    { environment: undefined },
    { e2e: "1" },
  ])
    assert.equal(
      await queueLowCreditNotice(notice, { ...f.options, ...overrides }),
      "disabled",
    );
  assert.equal(
    await queueLowCreditNotice({ ...notice, balance: 10 }, f.options),
    "not_low",
  );
  assert.equal(f.lookups(), 0);
  assert.equal(f.messages.length, 0);
});

test("reports missing verified email and rejects invalid data or configuration", async () => {
  const f = fixture();
  assert.equal(
    await queueLowCreditNotice(notice, {
      ...f.options,
      getVerifiedEmail: async () => null,
    }),
    "no_verified_email",
  );
  for (const input of [
    { ...notice, balance: NaN },
    { ...notice, paidUntil: Infinity },
    { ...notice, windowId: "" },
  ])
    await assert.rejects(
      queueLowCreditNotice(input, f.options),
      /Invalid low-credit/,
    );
  for (const overrides of [
    { sender: "" },
    { apiKey: "" },
    { paymentUrl: "" },
    { paymentUrl: "http://localhost/pricing" },
    { paymentUrl: "https://example.com/pricing?token=secret" },
  ])
    await assert.rejects(
      queueLowCreditNotice(notice, { ...f.options, ...overrides }),
    );
  await assert.rejects(
    queueLowCreditNotice(notice, {
      ...f.options,
      enqueue: async () => {
        throw new Error("queue failed");
      },
    }),
    /queue failed/,
  );
  assert.equal(f.messages.length, 0);
});

test("non-consuming balance observation validates the response", async () => {
  const { observeNoticeBalance } =
    await import("../backend/convex/agent/noticeBalance");
  let calls = 0;
  const valid = {
    customer_id: "owner",
    required_balance: 10,
    allowed: false,
    balance: {
      feature_id: "credits",
      unlimited: false,
      overage_allowed: false,
      remaining: 0,
    },
  };
  const reader =
    (value: unknown) => async (_key: string, method: string, body: object) => {
      calls++;
      assert.equal(method, "balances.check");
      assert.deepEqual(body, {
        customer_id: "owner",
        feature_id: "credits",
        required_balance: 10,
        send_event: false,
      });
      return value as Record<string, unknown>;
    };
  assert.equal(
    await observeNoticeBalance("owner", "fixture", reader(valid)),
    0,
  );
  for (const bad of [
    { ...valid, customer_id: "other" },
    { ...valid, required_balance: 1 },
    { ...valid, allowed: "false" },
    { ...valid, balance: null },
    { ...valid, balance: { ...valid.balance, feature_id: "other" } },
    { ...valid, balance: { ...valid.balance, unlimited: true } },
    { ...valid, balance: { ...valid.balance, overage_allowed: true } },
    { ...valid, balance: { ...valid.balance, remaining: Infinity } },
  ])
    await assert.rejects(
      observeNoticeBalance("owner", "fixture", reader(bad)),
      /Balance observation unavailable/,
    );
  const before = calls;
  await assert.rejects(observeNoticeBalance("owner", "", reader(valid)));
  assert.equal(calls, before);
});

test("notice uses a fresh observation and fences stale or ineligible work", async () => {
  const { getFunctionName } = await import("convex/server");
  const { deliverNotice } =
    await import("../backend/convex/agent/actions/compute");
  const { notice: mutate, noticeCandidate } =
    await import("../backend/convex/agent/compute");
  const make = (raw: number, observed: number) => {
    const until = Date.now() + 60000;
    const debit: any = {
      _id: "debit",
      sessionId: "session",
      state: "confirmed",
      paidUntil: until,
      responseBalance: raw,
    };
    const session: any = {
      _id: "session",
      userId: "owner",
      state: "active",
      debitId: "debit",
      paidUntil: until,
    };
    let owner: any = {};
    let reads = 0;
    const queues: number[] = [];
    const retries: any[] = [];
    const finalizers: any[] = [];
    const db: any = {
      get: async (table: string) =>
        table === "computeDebits"
          ? debit
          : table === "computeSessions"
            ? session
            : owner,
      normalizeId: (_table: string, id: string) => id,
      patch: async (_table: string, _id: string, value: object) =>
        Object.assign(debit, value),
    };
    const mutation: any = {
      db,
      scheduler: {
        runAt: async (when: number, ref: any, args: any) => {
          assert.equal(getFunctionName(ref), "agent/compute:notice");
          finalizers.push({ when, args });
        },
      },
      runMutation: async (_ref: unknown, args: any) => {
        queues.push(args.balance);
        return args.balance < 10 ? "queued" : "not_low";
      },
    };
    const ctx: any = {
      scheduler: {
        runAfter: async (_delay: number, _ref: unknown, args: any) =>
          retries.push(args),
      },
      runQuery: async (ref: any, args: any) =>
        getFunctionName(ref) === "agent/compute:getDebit"
          ? debit
          : (noticeCandidate as any)._handler({ db }, args),
      runMutation: async (ref: any, args: any) => {
        assert.equal(getFunctionName(ref), "agent/compute:notice");
        return (mutate as any)._handler(mutation, args);
      },
    };
    const options = {
      enabled: true,
      environment: "production",
      e2e: "0",
      key: "fixture",
      observe: async () => {
        reads++;
        return observed;
      },
    };
    return {
      debit,
      session,
      ctx,
      options,
      queues,
      retries,
      finalizers,
      finalize: (args: any) => (mutate as any)._handler(mutation, args),
      reads: () => reads,
      setOwner: (value: any) => {
        owner = value;
      },
    };
  };
  for (const [raw, fresh, outcome] of [
    [10, 0, "queued"],
    [0, 20, "not_low"],
  ] as const) {
    const f = make(raw, fresh);
    await deliverNotice(f.ctx, "debit" as any, 0, f.options);
    assert.equal(f.debit.responseBalance, raw);
    assert.equal(f.debit.noticeBalance, fresh);
    assert.equal(f.debit.noticeOutcome, outcome);
    assert.deepEqual(f.queues, [fresh]);
    await deliverNotice(f.ctx, "debit" as any, 0, f.options);
    assert.equal(f.reads(), 1);
  }
  for (const changes of [
    { enabled: false },
    { environment: "development" },
    { e2e: "1" },
  ]) {
    const f = make(0, 0);
    await deliverNotice(f.ctx, "debit" as any, 0, { ...f.options, ...changes });
    assert.equal(f.reads(), 0);
    assert.equal(f.debit.noticeOutcome, "disabled");
  }
  for (const owner of [null, { deletionRequestedAt: 1 }]) {
    const f = make(0, 0);
    f.setOwner(owner);
    await deliverNotice(f.ctx, "debit" as any, 0, f.options);
    assert.equal(f.reads(), 0);
    assert.equal(f.debit.noticeOutcome, "account_ineligible");
    assert.deepEqual(f.queues, []);
  }
  const retry = make(0, 0);
  retry.options.observe = async () => {
    throw new Error("lookup failed");
  };
  await deliverNotice(retry.ctx, "debit" as any, 0, retry.options);
  assert.deepEqual(retry.retries, [{ debitId: "debit", attempt: 1 }]);
  assert.equal(retry.debit.state, "confirmed");
  assert.equal(retry.debit.responseBalance, 0);
  assert.equal(retry.debit.noticeOutcome, undefined);
  await deliverNotice(retry.ctx, "debit" as any, 5, retry.options);
  assert.equal(retry.debit.noticeOutcome, undefined);
  assert.deepEqual(retry.finalizers, [
    {
      when: retry.debit.paidUntil,
      args: { debitId: "debit", failed: true },
    },
  ]);
  assert.deepEqual(retry.queues, []);
  // A successful in-flight observation can still win before the deadline.
  retry.options.observe = async () => 0;
  await deliverNotice(retry.ctx, "debit" as any, 0, retry.options);
  assert.equal(retry.debit.noticeOutcome, "queued");
  await retry.finalize(retry.finalizers[0].args);
  assert.deepEqual(retry.queues, [0]);
  assert.equal(retry.debit.noticeOutcome, "queued");

  const exhausted = make(10, 0);
  exhausted.options.observe = async () => {
    throw new Error("lookup failed");
  };
  await deliverNotice(exhausted.ctx, "debit" as any, 5, exhausted.options);
  exhausted.debit.paidUntil = Date.now() - 1;
  await exhausted.finalize(exhausted.finalizers[0].args);
  assert.equal(exhausted.debit.noticeOutcome, "expired");
  assert.deepEqual(exhausted.queues, []);
  assert.equal(exhausted.finalizers.length, 1);

  const initial = make(10, 0);
  initial.ctx.runQuery = async () => {
    throw new Error("initial read failed");
  };
  await deliverNotice(initial.ctx, "debit" as any, 0, initial.options);
  assert.deepEqual(initial.retries, [{ debitId: "debit", attempt: 1 }]);
  assert.equal(initial.reads(), 0);
  await deliverNotice(initial.ctx, "debit" as any, 5, initial.options);
  assert.equal(initial.retries.length, 1);
  assert.equal(initial.finalizers.length, 1);
  assert.equal(initial.debit.noticeOutcome, undefined);
  const racing = make(10, 0);
  racing.options.observe = async () => {
    racing.setOwner({ deletionRequestedAt: 1 });
    return 0;
  };
  await deliverNotice(racing.ctx, "debit" as any, 0, racing.options);
  assert.equal(racing.debit.noticeOutcome, "account_ineligible");
  assert.deepEqual(racing.queues, []);
  const expired = make(10, 0);
  expired.options.observe = async () => {
    expired.debit.paidUntil = Date.now() - 1;
    return 0;
  };
  await deliverNotice(expired.ctx, "debit" as any, 0, expired.options);
  assert.equal(expired.debit.noticeOutcome, "expired");
  assert.deepEqual(expired.queues, []);
});
