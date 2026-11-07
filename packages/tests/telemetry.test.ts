import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  captureTelemetry,
  telemetryEnabled,
} from "../disposabl-kit/server/lib/telemetry";
import {
  pageCategory,
  sendPageTelemetry,
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

test("web and mobile send only route categories and session bearer tokens", async () => {
  const bodies: any[] = [];
  globalThis.fetch = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response();
  }) as typeof fetch;
  await sendPageTelemetry(
    "https://example.com",
    "web",
    "/dashboard/connections?token=private",
    null,
  );
  await sendPageTelemetry(
    "https://example.com",
    "mobile",
    "/account",
    "session-token",
  );
  assert.deepEqual(bodies, [
    { platform: "web", page: "connections" },
    { platform: "mobile", page: "account" },
  ]);
  assert.equal(pageCategory("/private?email=x"), "other");
});

test("page ingestion derives identity from the verified session, never the body", async () => {
  const { page } = await import("../backend/convex/telemetry");
  const { default: app } = await import("../../disposabl.json");
  const originalFeatures = [...app.features];
  app.features.push("analytics");
  process.env.DISPOSABL_ENVIRONMENT = "production";
  process.env.POSTHOG_PROJECT_TOKEN = "test-token";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  let scheduled: any;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "verified-session" }) },
    runQuery: async (_ref: unknown, args: any) => {
      assert.equal(args.sessionId, "verified-session");
      return { userId: "verified-user" };
    },
    scheduler: {
      runAfter: async (_delay: number, _ref: unknown, args: unknown) => {
        scheduled = args;
      },
    },
  };
  try {
    const response = await (page as any)._handler(
      ctx,
      new Request("https://example.com/telemetry/page", {
        method: "POST",
        body: JSON.stringify({
          platform: "web",
          page: "home",
          userId: "spoofed",
          email: "private@example.com",
          url: "https://private/?token=secret",
        }),
      }),
    );
    assert.equal(response.status, 204);
    assert.deepEqual(scheduled, {
      event: "page_view",
      properties: { page: "home" },
      userId: "verified-user",
    });
  } finally {
    app.features.splice(0, app.features.length, ...originalFeatures);
  }
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
      platform: "android",
      channel: "preview",
      outcome: "success",
      duration_ms: 7200000,
      prompt: "private",
      url: "https://private.example",
    } as any,
    "owner",
    config,
  );
  assert.equal(body.properties.duration_ms, 7200000);
  assert.equal(body.properties.platform, "android");
  assert.equal(body.properties.channel, "preview");
  assert.equal(JSON.stringify(body).includes("private"), false);
});

test("release transitions measure from creation and ignore duplicate reports", async () => {
  const { report } = await import("../backend/convex/previews/internal");
  const { default: appConfig } = await import("../../disposabl.json");
  const features = [...appConfig.features];
  const original = Date.now;
  const scheduled: any[] = [];
  let release: any = null;
  const app = {
    _id: "row",
    _creationTime: 1000,
    appId: "11111111-1111-4111-8111-111111111111",
    userId: "owner",
    githubOwner: "owner",
    githubRepo: "repo",
    platforms: ["web"],
  };
  process.env.DISPOSABL_ENVIRONMENT = "production";
  process.env.POSTHOG_PROJECT_TOKEN = "token";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.POSTHOG_ENABLED;
  appConfig.features.push("analytics" as never);
  Date.now = () => 6000;
  const ctx = {
    scheduler: {
      runAfter: async (_delay: any, _fn: any, args: any) => {
        scheduled.push(args);
      },
    },
    db: {
      query: (table: string) => ({
        withIndex: () => ({
          unique: async () => (table === "apps" ? app : release),
        }),
      }),
      insert: async (_table: string, data: any) => {
        release = { _id: "release", ...data };
      },
      patch: async (_table: string, _id: string, data: any) => {
        release = { ...release, ...data };
      },
    },
  };
  const args = {
    userId: "owner",
    appId: "11111111-1111-4111-8111-111111111111",
    githubOwner: "owner",
    githubRepo: "repo",
    reference: "main",
    production: true,
    platform: "web",
    status: "ready",
    run: { id: 1, attempt: 1, number: 1, commitSha: "sha", url: "private" },
  };
  try {
    await (report as any)._handler(ctx, args);
    await (report as any)._handler(ctx, args);
    assert.equal(scheduled.length, 1);
    assert.deepEqual(scheduled[0].properties, {
      platform: "web",
      channel: "production",
      outcome: "success",
      duration_ms: 5000,
    });
    const failed = { ...args, status: "failed", run: { ...args.run, id: 2 } };
    await (report as any)._handler(ctx, failed);
    await (report as any)._handler(ctx, failed);
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].properties.outcome, "error");
    process.env.E2E_TELEMETRY_DISABLED = "1";
    await (report as any)._handler(ctx, {
      ...args,
      run: { ...args.run, id: 3 },
    });
    assert.equal(scheduled.length, 2);
  } finally {
    Date.now = original;
    appConfig.features.splice(0, appConfig.features.length, ...features);
  }
});
