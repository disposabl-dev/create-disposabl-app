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
      query: () => ({ withIndex: () => ({ first: async () => null }) }),
      get: async (_table: string, id: string) =>
        id === args.userId ? user : null,
      patch: async (_table: string, _id: string, value: object) =>
        Object.assign(user, value),
    },
    runMutation: async () => {
      const index = calls++;
      const complete = index >= 7;
      switch (index % 7) {
        case 0:
          return null;
        case 1:
          return null;
        case 2:
          return { complete, deleted: complete ? 2 : 3 };
        case 3:
          return { deleted: !complete };
        case 4:
          return { complete, emailsDeleted: 1, challengesDeleted: 2 };
        case 5:
          return {
            linkedRowsCleared: complete,
            deletedAccounts: 1,
            deletedSessions: 2,
            deletedRefreshTokens: 3,
          };
        default:
          return { complete, deletedAccounts: 1 };
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
  assert.equal(calls, 14);
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
  assert.equal(calls, 14);
});

test("old completed auth progress is revisited until Google identities are fenced", async () => {
  const prior = {
    state: "linked_auth_cleared",
    batches: 1,
    passwordsDeleted: 0,
    usernamesDeleted: 0,
    emailsDeleted: 0,
    emailChallengesDeleted: 0,
    accountsDeleted: 0,
    sessionsDeleted: 0,
    refreshTokensDeleted: 0,
  };
  const user: any = { deletionRequestedAt: 123, authDeletion: prior };
  const calls: string[] = [];
  const { getFunctionName } = await import("convex/server");
  const ctx = {
    db: {
      get: async () => user,
      patch: async (_table: string, _id: string, value: object) =>
        Object.assign(user, value),
    },
    runMutation: async (ref: any) => {
      let name: string;
      try {
        name = getFunctionName(ref);
      } catch (error) {
        name = String(error);
      }
      calls.push(name);
      if (name.endsWith("beginUserErasure")) return null;
      if (name.endsWith("eraseUserPasswords"))
        return { complete: true, deleted: 0 };
      if (name.endsWith("eraseUser")) return { deleted: false };
      if (name.endsWith("eraseUserBatch"))
        return { complete: true, emailsDeleted: 0, challengesDeleted: 0 };
      if (name.includes("_reference/childComponent/authGoogle"))
        return { complete: true, deletedAccounts: 1 };
      return {
        linkedRowsCleared: true,
        deletedAccounts: 0,
        deletedSessions: 0,
        deletedRefreshTokens: 0,
      };
    },
  } as any;
  const result = await (runBatch as any)._handler(ctx, {
    userId: "owner",
    expectedRequestedAt: 123,
  });
  assert.equal(result.googleCleared, true);
  assert.equal(result.accountsDeleted, 1);
  assert.equal(result.state, "linked_auth_cleared");
  assert.equal(calls.length, 7);
});
