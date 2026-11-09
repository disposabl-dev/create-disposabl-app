import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimDeletionStop,
  finishDeletionStop,
} from "../backend/convex/users/internal";

test("deletion stop waits for any user's live activation lease and rejects stale evidence", async () => {
  const user: any = { _id: "owner", deletionRequestedAt: 1 };
  const sessions: any[] = [
    {
      userId: "owner",
      activationLease: { token: "old-worker", until: Date.now() + 60_000 },
    },
    {
      userId: "owner",
      activationLease: { token: "new-worker", until: Date.now() - 1 },
    },
    {
      userId: "other",
      activationLease: { token: "other", until: Date.now() + 60_000 },
    },
  ];
  const ctx: any = {
    db: {
      get: async () => user,
      patch: async (_table: string, _id: string, update: object) =>
        Object.assign(user, update),
      query: () => ({
        withIndex: (_index: string, select: (q: any) => void) => {
          let owner: string;
          let after: number;
          const q: any = {
            eq(_field: string, value: string) {
              owner = value;
              return q;
            },
            gt(_field: string, value: number) {
              after = value;
              return q;
            },
          };
          select(q);
          return {
            first: async () =>
              sessions.find(
                (s) => s.userId === owner && s.activationLease?.until > after,
              ) ?? null,
          };
        },
      }),
    },
  };
  const claim = (token: string) =>
    (claimDeletionStop as any)._handler(ctx, { userId: "owner", token });
  const finish = (token: string) =>
    (finishDeletionStop as any)._handler(ctx, {
      userId: "owner",
      token,
      outcome: "archived_observed",
    });
  assert.equal(await claim("first"), false);
  sessions[0].activationLease.until = Date.now() - 1;
  assert.equal(await claim("first"), true);
  sessions[0].activationLease.until = Date.now() + 60_000;
  assert.equal(await finish("first"), false);
  assert.notEqual(user.deletionStop.state, "archived_observed");
  sessions[0].activationLease.until = Date.now() - 1;
  assert.equal(await finish("wrong-token"), false);
  assert.equal(await finish("first"), true);
  assert.equal(user.deletionStop.state, "archived_observed");
});
