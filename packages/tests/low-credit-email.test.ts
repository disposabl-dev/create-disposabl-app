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
