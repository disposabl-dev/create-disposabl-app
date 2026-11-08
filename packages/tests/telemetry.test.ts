import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  captureTelemetry,
  telemetryEnabled,
} from "../disposabl-kit/server/lib/telemetry";
import {
  pageCategory,
  createPageTelemetry,
} from "../disposabl-kit/lib/telemetry";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});
const config = {
  features: ["analytics", "authentication"],
  productionConvexSiteUrl: "https://prod.convex.site",
  analytics: { projectToken: "test-token", host: "https://us.i.posthog.com" },
};

test("requires analytics, production, token, approved host, and no E2E flag", () => {
  process.env.CONVEX_SITE_URL = config.productionConvexSiteUrl;
  delete process.env.DISPOSABL_ENVIRONMENT;
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  assert.equal(telemetryEnabled(config), true);
  assert.equal(telemetryEnabled({ ...config, features: [] }), false);
  assert.equal(
    telemetryEnabled({
      ...config,
      analytics: { ...config.analytics, projectToken: "" },
    }),
    false,
  );
  assert.equal(
    telemetryEnabled({
      ...config,
      analytics: { ...config.analytics, host: "https://example.com" },
    }),
    false,
  );
  process.env.E2E_TELEMETRY_DISABLED = "1";
  assert.equal(telemetryEnabled(config), false);
  delete process.env.E2E_TELEMETRY_DISABLED;
  process.env.CONVEX_SITE_URL = "https://dev.convex.site";
  assert.equal(telemetryEnabled(config), false);
  process.env.DISPOSABL_ENVIRONMENT = "production";
  assert.equal(telemetryEnabled(config), true);
  process.env.POSTHOG_ENABLED = "false";
  assert.equal(telemetryEnabled(config), false);
});

test("capture uses stable opaque authenticated identity and approved metadata", async () => {
  process.env.CONVEX_SITE_URL = config.productionConvexSiteUrl;
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  const bodies: any[] = [];
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  await captureTelemetry(
    "api_operation",
    {
      source: "cli",
      operation: "apps:setup",
      outcome: "error",
      duration_ms: 123,
      secret: "private",
    } as any,
    "private-user",
    config,
  );
  await captureTelemetry(
    "screen_view",
    { page: "home" },
    "private-user",
    config,
  );
  await captureTelemetry("page_view", { page: "home" }, undefined, config);
  assert.equal(
    bodies[0].properties.distinct_id,
    bodies[1].properties.distinct_id,
  );
  assert.notEqual(bodies[0].properties.distinct_id, "private-user");
  assert.notEqual(
    bodies[0].properties.distinct_id,
    bodies[2].properties.distinct_id,
  );
  assert.deepEqual(
    Object.keys(bodies[0].properties).sort(),
    [
      "$ip",
      "$process_person_profile",
      "distinct_id",
      "duration_ms",
      "environment",
      "operation",
      "outcome",
      "source",
    ].sort(),
  );
  globalThis.fetch = (async () => {
    throw new Error("sensitive");
  }) as typeof fetch;
  await assert.doesNotReject(
    captureTelemetry("page_view", { page: "home" }, undefined, config),
  );
});

test("page ingestion verifies auth and links anonymous identity without private metadata", async () => {
  const { page } = await import("../backend/convex/telemetry");
  const { default: app } = await import("../../disposabl.json");
  const originalFeatures = [...app.features];
  (app.features as string[]).push("analytics");
  process.env.DISPOSABL_ENVIRONMENT = "production";
  process.env.POSTHOG_PROJECT_TOKEN = "test-token";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  const events: any[] = [];
  globalThis.fetch = (async (_url, init) => {
    events.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "verified-session" }) },
    runQuery: async (_ref: unknown, args: any) => {
      assert.equal(args.sessionId, "verified-session");
      return { userId: "verified-user" };
    },
  };
  const anonymousId = "12345678-1234-4123-8123-123456789abc";
  try {
    const request = () =>
      new Request("https://example.com/telemetry/page", {
        method: "POST",
        headers: { Authorization: "Bearer private-token" },
        body: JSON.stringify({
          platform: "web",
          page: "home",
          anonymousId,
          userId: "spoofed",
          email: "private@example.com",
          url: "https://private/?token=secret",
        }),
      });
    const response = await (page as any)._handler(ctx, request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { anonymousId });
    assert.equal(events[0].event, "$identify");
    assert.equal(events[1].event, "page_view");
    assert.equal(
      events[0].properties.distinct_id,
      events[1].properties.distinct_id,
    );
    assert.match(events[0].properties.$anon_distinct_id, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(
      JSON.stringify(events),
      /private|spoofed|verified-user|12345678/,
    );
    process.env.E2E_TELEMETRY_DISABLED = "1";
    assert.equal((await (page as any)._handler(ctx, request())).status, 204);
    assert.equal(events.length, 2);
    delete process.env.E2E_TELEMETRY_DISABLED;
    const invalidCtx = { ...ctx, auth: { getUserIdentity: async () => null } };
    assert.equal(
      (await (page as any)._handler(invalidCtx, request())).status,
      401,
    );
    assert.equal(events.length, 2);
  } finally {
    app.features.splice(0, app.features.length, ...originalFeatures);
  }
});

test("anonymous capture and identify use the same opaque identity", async () => {
  process.env.CONVEX_SITE_URL = config.productionConvexSiteUrl;
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  const events: any[] = [];
  globalThis.fetch = (async (_input, init) => {
    events.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const id = "12345678-1234-4123-8123-123456789abc";
  await captureTelemetry("page_view", { page: "home" }, undefined, config, id);
  await captureTelemetry("page_view", { page: "login" }, "user-a", config, id);
  assert.equal(
    events[0].properties.distinct_id,
    events[1].properties.$anon_distinct_id,
  );
  assert.equal(events[1].event, "$identify");
  assert.equal(
    events[2].properties.distinct_id,
    events[1].properties.distinct_id,
  );
});

test("deployment telemetry sends only approved platform, channel and elapsed time", async () => {
  process.env.CONVEX_SITE_URL = config.productionConvexSiteUrl;
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  let body: any;
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response();
  }) as typeof fetch;
  await captureTelemetry(
    "platform_deployment",
    {
      app_id: "private-app",
      platform: "android",
      channel: "preview",
      outcome: "success",
      time_since_app_creation_ms: 7200000,
      run_number: 2,
      run_attempt: 1,
      prompt: "private",
      url: "https://private.example",
    } as any,
    "owner",
    config,
  );
  assert.equal(body.properties.time_since_app_creation_ms, 7200000);
  assert.equal(body.properties.duration_ms, undefined);
  assert.equal(body.properties.run_number, 2);
  assert.equal(body.properties.run_attempt, 1);
  assert.equal(body.properties.platform, "android");
  assert.equal(body.properties.channel, "preview");
  assert.equal(JSON.stringify(body).includes("private"), false);
  const appId = body.properties.app_id;
  assert.match(appId, /^[a-f0-9]{64}$/);
  await captureTelemetry(
    "app_created",
    { app_id: "private-app" },
    "owner",
    config,
  );
  assert.equal(body.properties.app_id, appId);
  await captureTelemetry(
    "app_setup",
    { app_id: "private-app", duration_ms: 400 },
    "owner",
    config,
  );
  assert.equal(body.properties.app_id, appId);
  assert.equal(body.properties.duration_ms, 400);
  await captureTelemetry(
    "app_created",
    { app_id: "another-app" },
    "owner",
    config,
  );
  assert.notEqual(body.properties.app_id, appId);
});

test("disabled, local and E2E capture makes no transport calls", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response();
  }) as typeof fetch;
  delete process.env.DISPOSABL_ENVIRONMENT;
  process.env.CONVEX_SITE_URL = "https://dev.convex.site";
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  await captureTelemetry(
    "page_view",
    { page: "home" },
    "user",
    config,
    "12345678-1234-4123-8123-123456789abc",
  );
  process.env.CONVEX_SITE_URL = config.productionConvexSiteUrl;
  process.env.E2E_TELEMETRY_DISABLED = "1";
  await captureTelemetry(
    "page_view",
    { page: "home" },
    "user",
    config,
    "12345678-1234-4123-8123-123456789abc",
  );
  delete process.env.E2E_TELEMETRY_DISABLED;
  process.env.POSTHOG_ENABLED = "false";
  await captureTelemetry(
    "page_view",
    { page: "home" },
    "user",
    config,
    "12345678-1234-4123-8123-123456789abc",
  );
  delete process.env.POSTHOG_ENABLED;
  await captureTelemetry(
    "page_view",
    { page: "home" },
    "user",
    { ...config, features: [] },
    "12345678-1234-4123-8123-123456789abc",
  );
  assert.equal(calls, 0);
});
