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

function identityContext() {
  const rows = new Map<
    string,
    { _id: string; hash: string; expiresAt: number; userId?: string }
  >();
  const jobs: any[] = [];
  let bucket: any = null;
  const db = {
    query: (table: string) => ({
      withIndex: (_index: string, predicate: (q: any) => unknown) => {
        let hash = "";
        predicate({
          eq: (_field: string, value: string) => {
            hash = value;
          },
        });
        return {
          unique: async () =>
            table === "telemetryIssuance"
              ? bucket
              : ([...rows.values()].find((row) => row.hash === hash) ?? null),
        };
      },
    }),
    insert: async (table: string, value: any) => {
      if (table === "telemetryIssuance") {
        bucket = { _id: "bucket", ...value };
        return "bucket";
      }
      const id = `row-${rows.size + 1}`;
      rows.set(id, { _id: id, ...value });
      return id;
    },
    patch: async (table: string, id: string, value: any) => {
      Object.assign(
        table === "telemetryIssuance" ? bucket : rows.get(id)!,
        value,
      );
    },
    get: async (_table: string, id: string) => rows.get(id) ?? null,
    delete: async (_table: string, id: string) => {
      rows.delete(id);
    },
  };
  return {
    rows,
    jobs,
    exhaust: () => {
      bucket = {
        _id: "bucket",
        key: "global",
        tokens: 0,
        updatedAt: Date.now(),
      };
    },
    ctx: {
      db,
      scheduler: {
        runAfter: async (...args: any[]) => {
          jobs.push(args);
        },
      },
    },
  };
}

test("page ingestion issues and binds an anonymous identity only to the verified account", async () => {
  const { page, claimIdentity } = await import("../backend/convex/telemetry");
  const { default: app } = await import("../../disposabl.json");
  const originalFeatures = [...app.features];
  if (!app.features.includes("analytics" as never))
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
  const fixture = identityContext();
  let user: string | null = null;
  const ctx = {
    auth: {
      getUserIdentity: async () =>
        user ? { subject: "verified-session" } : null,
    },
    runQuery: async (_ref: unknown, args: any) =>
      "sessionId" in args ? { userId: user } : false,
    runMutation: async (_ref: unknown, args: any) =>
      (claimIdentity as any)._handler(fixture.ctx, args),
  };
  const request = (anonymousId?: string, authenticated = false) =>
    new Request("https://example.com/telemetry/page", {
      method: "POST",
      headers: authenticated ? { Authorization: "Bearer private-token" } : {},
      body: JSON.stringify({
        platform: "web",
        page: "home",
        ...(anonymousId ? { anonymousId } : {}),
        userId: "spoofed",
        email: "private@example.com",
      }),
    });
  try {
    const first = await (page as any)._handler(ctx, request());
    const { anonymousId } = await first.json();
    assert.match(anonymousId, /^[0-9a-f-]{36}$/);
    assert.equal(events[0].event, "page_view");
    const anonymousDistinct = events[0].properties.distinct_id;
    user = "verified-user";
    const login = await (page as any)._handler(ctx, request(anonymousId, true));
    assert.equal((await login.json()).anonymousId, anonymousId);
    assert.equal(events[1].event, "$identify");
    assert.equal(events[1].properties.$anon_distinct_id, anonymousDistinct);
    assert.equal(
      events[2].properties.distinct_id,
      events[1].properties.distinct_id,
    );
    assert.doesNotMatch(
      JSON.stringify(events),
      /private|spoofed|verified-user/,
    );
    const fabricated = "12345678-1234-4123-8123-123456789abc";
    const fakeResponse = await (page as any)._handler(
      ctx,
      request(fabricated, true),
    );
    const fakeResult = await fakeResponse.json();
    assert.notEqual(fakeResult.anonymousId, fabricated);
    const crypto = await import("node:crypto");
    const fabricatedDistinct = crypto
      .createHash("sha256")
      .update(`disposabl:test-token:anonymous:${fabricated}`)
      .digest("hex");
    assert.notEqual(events[3].properties.$anon_distinct_id, fabricatedDistinct);
    user = "different-user";
    const switched = await (page as any)._handler(
      ctx,
      request(anonymousId, true),
    );
    assert.notEqual((await switched.json()).anonymousId, anonymousId);
    assert.notEqual(events[5].properties.$anon_distinct_id, anonymousDistinct);
    fixture.exhaust();
    const eventCount = events.length;
    const rowCount = fixture.rows.size;
    const jobCount = fixture.jobs.length;
    assert.equal(
      (await (page as any)._handler(ctx, request(undefined, true))).status,
      429,
    );
    assert.equal(fixture.rows.size, rowCount);
    assert.equal(fixture.jobs.length, jobCount);
    assert.equal(events.length, eventCount);
    user = "verified-user";
    assert.equal(
      (await (page as any)._handler(ctx, request(anonymousId, true))).status,
      200,
    );
    process.env.E2E_TELEMETRY_DISABLED = "1";
    const count = events.length;
    assert.equal(
      (await (page as any)._handler(ctx, request(anonymousId, true))).status,
      204,
    );
    assert.equal(events.length, count);
    delete process.env.E2E_TELEMETRY_DISABLED;
    user = null;
    assert.equal(
      (await (page as any)._handler(ctx, request(anonymousId, true))).status,
      401,
    );
    assert.equal(events.length, count);
  } finally {
    app.features.splice(0, app.features.length, ...originalFeatures);
  }
});

test("capabilities expire, cannot be reused by another account, and schedule bounded cleanup", async () => {
  const { claimIdentity, expireIdentity } =
    await import("../backend/convex/telemetry");
  const { ctx, rows, jobs } = identityContext();
  const claim = (hash: string | undefined, newHash: string, userId?: string) =>
    (claimIdentity as any)._handler(ctx, { hash, newHash, userId });
  assert.equal(await claim(undefined, "issued"), false);
  assert.equal(await claim("issued", "unused", "a"), true);
  assert.equal(await claim("issued", "unused", "a"), true);
  assert.equal(await claim("issued", "second", "b"), false);
  assert.equal(await claim("issued", "third"), false);
  assert.equal(jobs.length, 3);
  const original = [...rows.values()].find((row) => row.hash === "issued")!;
  original.expiresAt = Date.now() - 1;
  assert.equal(await claim("issued", "fourth", "a"), false);
  await (expireIdentity as any)._handler(ctx, { id: original._id });
  assert.equal(rows.has(original._id), false);
});

test("issuance budget refills at one identity per minute", async () => {
  const { claimIdentity } = await import("../backend/convex/telemetry");
  const fixture = identityContext();
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    fixture.exhaust();
    const claim = (newHash: string) =>
      (claimIdentity as any)._handler(fixture.ctx, { newHash });
    assert.equal(await claim("first"), null);
    now += 59_999;
    assert.equal(await claim("first"), null);
    now++;
    assert.equal(await claim("first"), false);
    assert.equal(await claim("second"), null);
    assert.equal(fixture.rows.size, 1);
    assert.equal(fixture.jobs.length, 1);
  } finally {
    Date.now = originalNow;
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
