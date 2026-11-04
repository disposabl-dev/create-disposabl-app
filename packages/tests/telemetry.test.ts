import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { captureTelemetry } from "../disposabl-kit/server/lib/telemetry";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const originalWarn = console.warn;
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  console.warn = originalWarn;
});

test("capture requires explicit opt-in and an approved host", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response();
  }) as typeof fetch;
  process.env.POSTHOG_PROJECT_TOKEN = "test-token";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  delete process.env.POSTHOG_ENABLED;
  await captureTelemetry("page_view", { page: "home" });
  process.env.POSTHOG_ENABLED = "true";
  process.env.POSTHOG_HOST = "https://example.com";
  await captureTelemetry("page_view", { page: "home" });
  assert.equal(calls, 0);
});

test("capture sends only approved properties and never propagates transport errors", async () => {
  let body: any;
  let warned = "";
  process.env.POSTHOG_PROJECT_TOKEN = "test-token";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  process.env.POSTHOG_ENABLED = "true";
  console.warn = (message) => {
    warned = String(message);
  };
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  await captureTelemetry("api_operation", {
    source: "cli",
    operation: "apps:setup",
    outcome: "error",
    duration_ms: 123,
    secret: "must-not-leak",
  } as any);
  assert.equal(body.event, "api_operation");
  assert.deepEqual(
    { ...body.properties, distinct_id: undefined },
    {
      source: "cli",
      operation: "apps:setup",
      outcome: "error",
      duration_ms: 123,
      environment: "production",
      $process_person_profile: false,
      $ip: "0.0.0.0",
      distinct_id: undefined,
    },
  );
  assert.equal(body.properties.secret, undefined);
  assert.equal(warned, "PostHog capture failed.");
  globalThis.fetch = (async () => {
    throw new Error("sensitive transport error");
  }) as typeof fetch;
  await assert.doesNotReject(captureTelemetry("page_view", { page: "home" }));
});
