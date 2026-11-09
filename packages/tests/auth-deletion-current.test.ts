import { test } from "node:test";
import assert from "node:assert/strict";
import { runBatch } from "../backend/convex/users/authDeletion";
import { advanceLocalBatch } from "../backend/convex/users/localDeletion";

test("current auth batches retain counters and finish once all attributed work clears", async () => {
  const user: any = { deletionRequestedAt: 123 };
  const args = { userId: "synthetic-owner", expectedRequestedAt: 123 };
  let calls = 0;
  const ctx = {
    db: {
      get: async (_table: string, id: string) =>
        id === args.userId ? user : null,
      patch: async (_table: string, _id: string, value: object) =>
        Object.assign(user, value),
    },
    runMutation: async () => {
      const index = calls++;
      const complete = index >= 5;
      switch (index % 5) {
        case 0:
          return null;
        case 1:
          return { complete, deleted: complete ? 2 : 3 };
        case 2:
          return { deleted: !complete };
        case 3:
          return { complete, emailsDeleted: 1, challengesDeleted: 2 };
        default:
          return {
            linkedRowsCleared: complete,
            deletedAccounts: 1,
            deletedSessions: 2,
            deletedRefreshTokens: 3,
          };
      }
    },
  } as any;
  const run = (input = args) => (runBatch as any)._handler(ctx, input);
  await assert.rejects(
    run({ ...args, expectedRequestedAt: 122 }),
    /Matching deletion request/,
  );
  assert.equal(calls, 0);
  const first = await run();
  assert.equal(first.state, "in_progress");
  assert.equal(first.usernameCleared, true);
  assert.equal(first.attributedEmailsCleared, false);
  assert.equal(first.unattributedAuthRowsUnverified, true);
  const second = await run();
  assert.equal(second.state, "linked_auth_cleared");
  assert.equal(second.batches, 2);
  assert.equal(second.passwordsDeleted, 5);
  assert.equal(second.usernamesDeleted, 1);
  assert.equal(second.emailsDeleted, 2);
  assert.equal(second.emailChallengesDeleted, 4);
  assert.equal(second.refreshTokensDeleted, 6);
  assert.equal(second.attributedEmailsCleared, true);
  assert.deepEqual(await run(), second);
  assert.equal(calls, 10);
  user.mcpDeletion = { state: "attributed_complete" };
  user.ephemeralDeletion = {
    requestedAt: 123,
    state: "known_user_bound_cleared",
  };
  user.fileDeletion = { state: "known_convex_cleared" };
  const result = await (advanceLocalBatch as any)._handler(ctx, args);
  assert.equal(result.status, "requested");
  assert.equal(result.outcome, "local_stages_cleared");
  assert.ok(result.blockers.some((s: string) => /unattributed/i.test(s)));
  assert.equal(calls, 10);
});
