import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimIdentity as product,
  page,
  bootstrap,
} from "../backend/convex/telemetry";
import { claimIdentity as generic } from "../disposabl-kit/server/lib/telemetry";

function context(user: object | null, valid = true) {
  const writes: string[] = [];
  const ctx = {
    db: {
      normalizeId: () => (valid ? "owner" : null),
      get: async () => user,
      query: (table: string) => ({
        withIndex: () => ({ unique: async () => null }),
      }),
      insert: async (table: string) => {
        writes.push(table);
        return "id";
      },
      patch: async (table: string) => {
        writes.push(table);
      },
    },
    scheduler: {
      runAfter: async () => {
        writes.push("scheduler");
      },
    },
  };
  return { ctx: ctx as any, writes };
}

test("product claim denies pending, missing and invalid owners before any writes", async () => {
  for (const [user, valid] of [
    [{ deletionRequestedAt: 1 }, true],
    [null, true],
    [null, false],
  ] as const) {
    const { ctx, writes } = context(user, valid);
    await assert.rejects(
      (product as any)._handler(ctx, { newHash: "new", userId: "owner" }),
    );
    assert.deepEqual(writes, []);
  }
});

test("active owner, anonymous claim and generic starter retain issuance", async () => {
  for (const [handler, userId] of [
    [product, "owner"],
    [product, undefined],
    [generic, "owner"],
  ] as const) {
    const { ctx, writes } = context(
      userId === "owner" && handler === product ? {} : null,
    );
    assert.equal(
      await (handler as any)._handler(ctx, {
        newHash: "new",
        ...(userId ? { userId } : {}),
      }),
      false,
    );
    assert.deepEqual(writes, [
      "telemetryIssuance",
      "telemetryIdentities",
      "scheduler",
    ]);
  }
});

test("page ingestion rejects a deletion racing the session check without emitting", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const { ctx: mutationCtx, writes } = context({ deletionRequestedAt: 1 });
  let emissions = 0;
  try {
    process.env.DISPOSABL_ENVIRONMENT = "production";
    process.env.POSTHOG_PROJECT_TOKEN = "test-token";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    delete process.env.E2E_TELEMETRY_DISABLED;
    delete process.env.POSTHOG_ENABLED;
    globalThis.fetch = (async () => {
      emissions++;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "verified-session" }) },
      runQuery: async (_ref: unknown, args: any) =>
        "sessionId" in args ? { userId: "owner" } : false,
      runMutation: async (_ref: unknown, args: any) =>
        (product as any)._handler(mutationCtx, args),
    };
    const response = await (page as any)._handler(
      ctx,
      new Request("https://example.com/telemetry/page", {
        method: "POST",
        headers: { Authorization: "Bearer test" },
        body: JSON.stringify({
          platform: "web",
          page: "home",
          anonymousId: "12345678-1234-4123-8123-123456789abc",
        }),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(emissions, 0);
    assert.deepEqual(writes, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

test("bootstrap rejects deletion racing the session check without issuing a lease", async () => {
  const oldEnv = { ...process.env };
  const { ctx: mutationCtx, writes } = context({ deletionRequestedAt: 1 });
  try {
    process.env.DISPOSABL_ENVIRONMENT = "production";
    process.env.POSTHOG_PROJECT_TOKEN = "phc_fixture_public";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    delete process.env.E2E_TELEMETRY_DISABLED;
    delete process.env.POSTHOG_ENABLED;
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "session" }) },
      runQuery: async (_ref: unknown, args: any) =>
        "sessionId" in args ? { userId: "owner" } : false,
      runMutation: async (_ref: unknown, args: any) =>
        (product as any)._handler(mutationCtx, args),
    };
    const response = await (bootstrap as any)._handler(
      ctx,
      new Request("https://local/telemetry/bootstrap", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
        body: "{}",
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(await response.text(), "");
    assert.deepEqual(writes, []);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
});
