import { test } from "node:test";
import assert from "node:assert/strict";
import { v } from "convex/values";
import { internalQuery } from "../disposabl-kit/server/lib/functions";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";
import { createClientConfig } from "../sdk/src/config";
import { createClient } from "../sdk/src/generated/client";
import { usersCurrent } from "../sdk/src/generated/sdk.gen";

const current = internalQuery({
  platforms: true,
  args: { userId: v.string() },
  returns: v.object({ id: v.string() }),
  handler: async (_ctx, { userId }) => ({ id: userId }),
});

test("generated SDK attribution reaches the authenticated API event without request contents", async () => {
  const saved = { ...process.env };
  const jobs: any[] = [];
  const observed: Request[] = [];
  try {
    process.env.DISPOSABL_ENVIRONMENT = "production";
    process.env.POSTHOG_PROJECT_TOKEN = "phc_fixture_public";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    delete process.env.E2E_TELEMETRY_DISABLED;
    delete process.env.POSTHOG_ENABLED;
    const ctx = {
      runQuery: async (_ref: unknown, args: { userId: string }) => ({
        id: args.userId,
      }),
      scheduler: {
        runAfter: async (...args: any[]) => {
          jobs.push(args);
        },
      },
    } as any;
    const platform = createPlatforms({ "users/internal": { current } });
    const fetchLocal = async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      observed.push(request);
      return platform.handleApi(ctx, request, async (_ctx, req) =>
        req.headers.get("Authorization") === "Bearer synthetic-token"
          ? {
              userId: "synthetic-owner",
              scopes: [],
              clientId: "fixture",
              connectionId: "fixture",
            }
          : null,
      );
    };
    const makeClient = (auth?: string, source?: string) => {
      const instance = createClient(
        createClientConfig({
          baseUrl: "https://fixture.invalid",
          fetch: fetchLocal as typeof fetch,
          ...(auth ? { auth } : {}),
        }),
      );
      if (source)
        instance.setConfig({ headers: { "X-Disposabl-Source": source } });
      return instance;
    };
    const client = makeClient("synthetic-token");
    const result = await usersCurrent({ client });
    assert.equal(result.response?.status, 200);
    assert.equal(observed[0].headers.get("X-Disposabl-Source"), "sdk");
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0][2].event, "api_operation");
    assert.deepEqual(jobs[0][2].properties, {
      source: "sdk",
      operation: "users/internal:current",
      outcome: "success",
      duration_ms: jobs[0][2].properties.duration_ms,
    });
    assert.doesNotMatch(
      JSON.stringify(jobs),
      /synthetic-token|fixture\.invalid/,
    );
    jobs.length = 0;
    const unknown = await usersCurrent({
      client: makeClient("synthetic-token", "private-secret"),
    });
    assert.equal(unknown.response?.status, 200);
    assert.equal(jobs[0][2].properties.source, "api");
    assert.doesNotMatch(JSON.stringify(jobs), /private-secret/);
    jobs.length = 0;
    const anonymous = await usersCurrent({ client: makeClient() });
    assert.equal(anonymous.response?.status, 401);
    assert.equal(jobs.length, 0);
    process.env.E2E_TELEMETRY_DISABLED = "1";
    const optedOut = await usersCurrent({ client });
    assert.equal(optedOut.response?.status, 200);
    assert.equal(jobs.length, 0);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
