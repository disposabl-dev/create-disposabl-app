import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginAttempt,
  finishAttempt,
  hasUnknownAttempt,
} from "../disposabl-kit/server/billing-functions";

test("uncertain checkout persists and prevents replay without blocking a different purchase", async () => {
  const rows: {
    _id: string;
    userId: string;
    purchase: string;
    requestId: string;
    url?: string;
  }[] = [];
  const ctx = {
    db: {
      query: () => ({
        withIndex: (_: string, filter: (q: any) => any) => {
          const fields: Record<string, string | undefined> = {};
          const q = {
            eq: (key: string, value: string | undefined) => {
              fields[key] = value;
              return q;
            },
          };
          filter(q);
          const matches = () =>
            rows.filter((row) =>
              Object.entries(fields).every(
                ([key, value]) => (row as any)[key] === value,
              ),
            );
          return {
            unique: async () => matches()[0] ?? null,
            first: async () => matches()[0] ?? null,
          };
        },
      }),
      insert: async (_: string, row: any) => {
        rows.push({ ...row, _id: String(rows.length + 1) });
      },
      patch: async (_: string, id: string, value: { url: string }) => {
        Object.assign(
          rows.find((row) => row._id === id)!,
          value,
        );
      },
    },
  };
  const begin = (purchase: string, requestId: string) =>
    (beginAttempt as any)._handler(ctx, {
      userId: "alice",
      purchase,
      requestId,
    });
  const pending = () =>
    (hasUnknownAttempt as any)._handler(ctx, { userId: "alice" });
  assert.equal(await begin("monthly", "one"), null);
  await assert.rejects(begin("monthly", "one"), /review/);
  await assert.rejects(begin("monthly", "two"), /review/);
  assert.equal(await begin("topup", "three"), null);
  assert.equal(await pending(), true);
  await (finishAttempt as any)._handler(ctx, {
    userId: "alice",
    purchase: "topup",
    requestId: "three",
    url: "https://checkout.example/three",
  });
  assert.equal(await pending(), true);
  await (finishAttempt as any)._handler(ctx, {
    userId: "alice",
    purchase: "monthly",
    requestId: "one",
    url: "https://checkout.example/one",
  });
  assert.equal(await pending(), false);
  assert.equal(await begin("monthly", "one"), "https://checkout.example/one");
  assert.equal(await begin("monthly", "two"), null);
});
