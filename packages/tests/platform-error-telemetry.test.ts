import { test } from "node:test";
import assert from "node:assert/strict";
import { v } from "convex/values";
import { internalMutation } from "../disposabl-kit/server/lib/functions";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";

const operation = internalMutation({
  platforms: true,
  args: { userId: v.string(), value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => args.value,
});
const user = {
  userId: "synthetic-owner",
  scopes: [],
  clientId: "fixture",
  connectionId: "fixture",
};

test("API and MCP failures emit one sanitized operation event and fixed API log", async () => {
  const saved = { ...process.env };
  const previousError = console.error;
  const logs: unknown[][] = [];
  const jobs: unknown[][] = [];
  const secret = "secret-marker-email-prompt-path-token";
  try {
    process.env.DISPOSABL_ENVIRONMENT = "production";
    process.env.POSTHOG_PROJECT_TOKEN = "phc_fixture_public";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    delete process.env.E2E_TELEMETRY_DISABLED;
    delete process.env.POSTHOG_ENABLED;
    console.error = (...args) => {
      logs.push(args);
    };
    const ctx = {
      runMutation: async () => {
        throw new Error(secret);
      },
      scheduler: {
        runAfter: async (...args: unknown[]) => {
          jobs.push(args);
        },
      },
    } as any;
    const platforms = createPlatforms({ "sample/internal": { operation } });
    const request = () =>
      new Request(
        `https://example.test/api/sample/operation?private=${secret}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Disposabl-Source": "sdk",
          },
          body: JSON.stringify({ value: secret }),
        },
      );
    const response = await platforms.handleApi(
      ctx,
      request(),
      async () => user,
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
    assert.deepEqual(logs, [["platform_api_internal_error"]]);
    assert.equal(jobs.length, 1);
    assert.deepEqual((jobs[0] as any[])[2].properties, {
      source: "sdk",
      operation: "sample/internal:operation",
      outcome: "error",
      duration_ms: (jobs[0] as any[])[2].properties.duration_ms,
    });
    assert.doesNotMatch(JSON.stringify({ jobs, logs }), new RegExp(secret));
    jobs.length = 0;
    logs.length = 0;
    const preDispatch = await platforms.handleApi(ctx, request(), async () => {
      throw new Error(secret);
    });
    assert.equal(preDispatch.status, 500);
    assert.deepEqual(logs, [["platform_api_internal_error"]]);
    assert.equal(jobs.length, 1);
    assert.deepEqual((jobs[0] as any[])[2].properties, {
      source: "sdk",
      operation: "sample/internal:operation",
      outcome: "error",
    });
    assert.doesNotMatch(JSON.stringify({ jobs, logs }), new RegExp(secret));
    jobs.length = 0;
    logs.length = 0;
    await assert.rejects(
      platforms.tools.sample_internal_operation.handler(
        ctx,
        { value: secret },
        user,
      ),
      (error) => error instanceof Error && error.message === secret,
    );
    assert.equal(jobs.length, 1);
    assert.equal((jobs[0] as any[])[2].event, "mcp_operation");
    assert.equal((jobs[0] as any[])[2].properties.outcome, "error");
    assert.deepEqual(logs, []);
    assert.doesNotMatch(JSON.stringify(jobs), new RegExp(secret));
    jobs.length = 0;
    process.env.E2E_TELEMETRY_DISABLED = "1";
    await platforms.handleApi(ctx, request(), async () => {
      throw new Error(secret);
    });
    assert.equal(jobs.length, 0);
  } finally {
    console.error = previousError;
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
