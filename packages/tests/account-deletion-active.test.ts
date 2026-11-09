import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.ACCOUNT_DELETION_FIXTURE_URL;
if (url && !["http://127.0.0.1:3540", "http://localhost:3540"].includes(url))
  throw new Error("Account deletion fixture requires loopback port 3540");
async function call(name: string, args: object, query = false): Promise<any> {
  const r = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await r.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
test(
  "native session guard fences pending owner but preserves other users and status",
  { skip: !url },
  async () => {
    const alice = await call("create", { label: randomUUID() });
    const bob = await call("create", { label: randomUUID() });
    assert.equal(await call("active", { userId: alice }, true), alice);
    await call("request", { userId: alice, confirmation: "DELETE" });
    assert.equal(await call("active", { userId: alice }, true), null);
    assert.equal(await call("nativeApp", { userId: alice }, true), null);
    assert.deepEqual(await call("nativeApp", { userId: bob }, true), {
      appId: "fixture",
      userId: bob,
    });
    assert.equal(await call("active", { userId: bob }, true), bob);
    assert.equal(await call("active", { userId: null }, true), null);
    assert.equal(
      (await call("status", { userId: alice }, true)).status,
      "requested",
    );
  },
);

test("local operator advances one existing stage, resumes legacy auth, and reports blockers", async () => {
  const { advanceLocalBatch } =
    await import("../backend/convex/users/localDeletion");
  const { getFunctionName } = await import("convex/server");
  const user: any = { deletionRequestedAt: 123 };
  const args = { userId: "owner", expectedRequestedAt: 123 };
  const calls: string[] = [];
  let interrupted = true;
  let mcpBatches = 0;
  let fileBlocked = true;
  const ctx = {
    db: {
      get: async (_table: string, id: string) =>
        id === "owner"
          ? user
          : id === "other"
            ? { deletionRequestedAt: 999 }
            : null,
    },
    runMutation: async (ref: any, forwarded: unknown) => {
      assert.deepEqual(forwarded, args);
      const name = getFunctionName(ref);
      calls.push(name);
      if (name === "users/mcpDeletion:runBatch") {
        if (interrupted) {
          interrupted = false;
          throw new Error("interrupted");
        }
        user.mcpDeletion = {
          state: ++mcpBatches === 1 ? "in_progress" : "attributed_complete",
        };
        return user.mcpDeletion;
      }
      if (name === "users/authDeletion:runBatch") {
        user.authDeletion = {
          state: "linked_auth_cleared",
          usernameCleared: true,
          attributedEmailsCleared: true,
          unattributedEmailChallengesUnverified: true,
        };
        return user.authDeletion;
      }
      if (name === "users/ephemeralDeletion:runBatch") {
        user.ephemeralDeletion = {
          requestedAt: 123,
          state: "known_user_bound_cleared",
        };
        return user.ephemeralDeletion;
      }
      if (name === "users/fileDeletion:runBatch") {
        user.fileDeletion = {
          state: fileBlocked ? "blocked" : "known_convex_cleared",
        };
        return user.fileDeletion;
      }
      throw new Error(`Unexpected stage: ${name}`);
    },
  } as any;
  const advance = (input = args) =>
    (advanceLocalBatch as any)._handler(ctx, input);
  await assert.rejects(
    advance({ ...args, userId: "other" }),
    /Matching deletion request not found/,
  );
  await assert.rejects(
    advance({ ...args, expectedRequestedAt: 122 }),
    /Matching deletion request not found/,
  );
  assert.deepEqual(calls, []);
  await assert.rejects(advance(), /interrupted/);
  assert.equal((await advance()).stage, "mcp");
  assert.equal((await advance()).stage, "mcp");
  user.authDeletion = {
    state: "linked_auth_cleared",
    passwordsCleared: true,
    linkedRowsCleared: true,
  };
  assert.equal((await advance()).stage, "auth");
  user.ephemeralDeletion = {
    requestedAt: 122,
    state: "known_user_bound_cleared",
  };
  assert.equal((await advance()).stage, "ephemeral");
  const blocked = await advance();
  assert.equal(blocked.stage, "files");
  assert.equal(blocked.outcome, "blocked");
  assert.match(blocked.blockers[0], /R2 files or shared/);
  fileBlocked = false;
  assert.equal((await advance()).stage, "files");
  const done = await advance();
  assert.equal(done.status, "requested");
  assert.equal(done.outcome, "local_stages_cleared");
  assert.ok(
    done.blockers.some((value: string) => /provider cleanup/.test(value)),
  );
  assert.ok(done.blockers.some((value: string) => /retention/.test(value)));
  assert.deepEqual(await advance(), done);
  assert.deepEqual(calls, [
    "users/mcpDeletion:runBatch",
    "users/mcpDeletion:runBatch",
    "users/mcpDeletion:runBatch",
    "users/authDeletion:runBatch",
    "users/ephemeralDeletion:runBatch",
    "users/fileDeletion:runBatch",
    "users/fileDeletion:runBatch",
  ]);
});
