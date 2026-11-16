import { test } from "node:test";
import assert from "node:assert/strict";
import { finish } from "../backend/convex/users/automation";

const args = {
  userId: "owner",
  expectedRequestedAt: 123,
  reference: "ref",
  token: "job",
};
function setup() {
  let user: any = {
    deletionRequestedAt: 123,
    deletionAutomation: {
      state: "running",
      token: "job",
      steps: 0,
      waits: 0,
      updatedAt: 1,
    },
  };
  const scheduled: any[] = [];
  return {
    ctx: {
      db: {
        get: async () => user,
        patch: async (_table: unknown, _id: unknown, patch: any) => {
          user = { ...user, ...patch };
        },
      },
      scheduler: {
        runAfter: async (...v: any[]) => {
          scheduled.push(v);
        },
      },
    },
    user: () => user,
    scheduled,
  };
}

test("live worker checks back off; unknown provider failures stop", async () => {
  const a = setup();
  await (finish as any)._handler(a.ctx, {
    ...args,
    outcome: "blocked",
    detail: "Agent worker or activation lease is still active.",
  });
  assert.equal(a.user().deletionAutomation.state, "scheduled");
  assert.equal(a.scheduled[0][0], 30000);
  const b = setup();
  await (finish as any)._handler(b.ctx, {
    ...args,
    outcome: "failed",
    detail: "",
  });
  assert.equal(b.user().deletionAutomation.state, "blocked");
  assert.match(
    b.user().deletionAutomation.detail,
    /provider outcome is unknown/,
  );
  assert.equal(b.scheduled.length, 0);
});
