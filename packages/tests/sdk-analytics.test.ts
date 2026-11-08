import { test } from "node:test";
import assert from "node:assert/strict";
import { createSdkAnalytics } from "../sdk/src/analytics";

test("SDK analytics is opt-in, production-only and disabled in E2E", async () => {
  const events: unknown[] = [];
  const capture = (event: unknown) => {
    events.push(event);
  };
  for (const config of [
    { enabled: false, environment: "production" as const },
    { enabled: true, environment: "development" as const },
    { enabled: true, environment: "test" as const },
    { enabled: true, environment: "production" as const, e2e: true },
  ])
    await createSdkAnalytics({ ...config, capture }).track(
      "appsList",
      async () => ({}),
    );
  const old = process.env.E2E_TELEMETRY_DISABLED;
  process.env.E2E_TELEMETRY_DISABLED = "1";
  try {
    await createSdkAnalytics({
      enabled: true,
      environment: "production",
      capture,
    }).track("appsList", async () => ({}));
  } finally {
    if (old === undefined) delete process.env.E2E_TELEMETRY_DISABLED;
    else process.env.E2E_TELEMETRY_DISABLED = old;
  }
  assert.deepEqual(events, []);
});

test("SDK analytics allows only operation and outcome, preserving results and errors", async () => {
  const events: unknown[] = [];
  const analytics = createSdkAnalytics({
    enabled: true,
    environment: "production",
    capture: (event) => {
      events.push(event);
    },
  });
  const result = {
    data: { secret: "private" },
    response: { url: "https://private" },
  };
  assert.equal(await analytics.track("appsList", async () => result), result);
  await analytics.track("appsCreate", async () => ({ error: "private" }));
  const error = new Error("private");
  await assert.rejects(
    analytics.track("appsGet", async () => {
      throw error;
    }),
    (e) => e === error,
  );
  await analytics.track(
    "https://private/?token=secret" as never,
    async () => ({}),
  );
  assert.deepEqual(events, [
    { operation: "appsList", outcome: "success" },
    { operation: "appsCreate", outcome: "error" },
    { operation: "appsGet", outcome: "error" },
  ]);
});

test("sync and async capture failures never affect calls", async () => {
  for (const capture of [
    () => {
      throw new Error("private");
    },
    async () => {
      throw new Error("private");
    },
  ]) {
    const analytics = createSdkAnalytics({
      enabled: true,
      environment: "production",
      capture,
    });
    assert.equal(await analytics.track("appsList", async () => 1), 1);
  }
});
