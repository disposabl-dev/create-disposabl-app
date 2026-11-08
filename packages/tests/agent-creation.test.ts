import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueueMessage } from "../backend/convex/agent/internal";

const connected = {
  ready: true,
  missing: [],
  expo: { name: "Expo" },
  connectionsUrl: "https://example.com/dashboard/connections",
};

test("agent creation saves structured selections and resolves feature dependencies", async () => {
  const previous = process.env.BOAT_API_KEY;
  process.env.BOAT_API_KEY = "fixture-no-provider-calls";
  let saved: any;
  let prerequisites: any;
  try {
    await assert.rejects(
      (enqueueMessage as any)._handler(
        {
          runQuery: async (_ref: unknown, args: unknown) => {
            prerequisites = args;
            return connected;
          },
          db: {
            insert: async (_table: string, value: unknown) => {
              saved = value;
              throw new Error("fixture stops before scheduling");
            },
          },
        },
        {
          userId: "owner",
          prompt: "Build a planner",
          platforms: ["android", "cli"],
          features: ["payments"],
        },
      ),
      /fixture stops/,
    );
    assert.deepEqual(saved.platforms, ["web", "android", "api", "cli"]);
    assert.deepEqual(saved.features, ["authentication", "payments"]);
    assert.deepEqual(prerequisites, {
      userId: "owner",
      features: ["authentication", "payments"],
    });
  } finally {
    if (previous === undefined) delete process.env.BOAT_API_KEY;
    else process.env.BOAT_API_KEY = previous;
  }
});

test("mobile creation without Expo fails before inserting or scheduling work", async () => {
  const previous = process.env.BOAT_API_KEY;
  process.env.BOAT_API_KEY = "fixture-no-provider-calls";
  let inserted = false;
  try {
    await assert.rejects(
      (enqueueMessage as any)._handler(
        {
          runQuery: async () => ({ ...connected, expo: null }),
          db: {
            insert: async () => {
              inserted = true;
            },
          },
        },
        { userId: "owner", prompt: "Build a planner", platforms: ["ios"] },
      ),
      (error: any) => error.data?.missing?.includes("expo"),
    );
    assert.equal(inserted, false);
  } finally {
    if (previous === undefined) delete process.env.BOAT_API_KEY;
    else process.env.BOAT_API_KEY = previous;
  }
});
