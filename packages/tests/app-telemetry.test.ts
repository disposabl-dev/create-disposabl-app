import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
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
      app_id: app.appId,
      platform: "web",
      channel: "production",
      outcome: "success",
      time_since_app_creation_ms: 5000,
      run_number: 1,
      run_attempt: 1,
    });
    Date.now = () => 604801000;
    const failed = {
      ...args,
      status: "failed",
      run: { ...args.run, id: 2, number: 2 },
    };
    await (report as any)._handler(ctx, failed);
    await (report as any)._handler(ctx, failed);
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].properties.outcome, "error");
    assert.equal(scheduled[1].properties.time_since_app_creation_ms, 604800000);
    assert.equal(
      scheduled[1].properties.app_id,
      scheduled[0].properties.app_id,
    );
    assert.equal(scheduled[1].properties.run_number, 2);
    // Older and duplicate reports cannot alter the latest attempt's observations.
    await (report as any)._handler(ctx, args);
    assert.equal(scheduled.length, 2);
    await (report as any)._handler(ctx, {
      ...failed,
      status: "ready",
      run: { ...failed.run, attempt: 2 },
    });
    assert.equal(scheduled[2].properties.run_attempt, 2);
    assert.equal(scheduled[2].properties.outcome, "success");
    // A same-attempt correction remains reconcilable by app/run/attempt/platform/channel.
    await (report as any)._handler(ctx, {
      ...failed,
      run: { ...failed.run, attempt: 2 },
    });
    assert.equal(scheduled[3].properties.run_attempt, 2);
    assert.equal(scheduled[3].properties.outcome, "error");
    process.env.E2E_TELEMETRY_DISABLED = "1";
    await (report as any)._handler(ctx, {
      ...args,
      run: { ...args.run, id: 3 },
    });
    assert.equal(scheduled.length, 4);
  } finally {
    Date.now = original;
    appConfig.features.splice(0, appConfig.features.length, ...features);
  }
});
