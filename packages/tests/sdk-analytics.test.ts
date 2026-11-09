import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createSdkAnalytics } from "../sdk/src/analytics";

const inheritedFlags = {
  E2E_TELEMETRY_DISABLED: process.env.E2E_TELEMETRY_DISABLED,
  DO_NOT_TRACK: process.env.DO_NOT_TRACK,
  DISPOSABL_TELEMETRY_DISABLED: process.env.DISPOSABL_TELEMETRY_DISABLED,
  NODE_ENV: process.env.NODE_ENV,
  BUN_ENV: process.env.BUN_ENV,
  CI: process.env.CI,
};
beforeEach(() => {
  // These tests use in-memory sinks only; each opt-out is exercised explicitly.
  for (const key of Object.keys(inheritedFlags)) delete process.env[key];
});

test("runtime opt-out and local execution override an explicit production configuration", async () => {
  const events: unknown[] = [];
  const analytics = createSdkAnalytics({
    environment: "production",
    capture: (event) => {
      events.push(event);
    },
  });
  for (const [key, value] of Object.entries({
    NODE_ENV: "development",
    BUN_ENV: "test",
    CI: "true",
    E2E_TELEMETRY_DISABLED: "1",
    DISPOSABL_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "true",
  })) {
    process.env[key] = value;
    await analytics.track("appsList", async () => ({}));
    delete process.env[key];
  }
  assert.deepEqual(events, []);
});
afterEach(() => {
  for (const [key, value] of Object.entries(inheritedFlags)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("SDK analytics respects opt-out, production and E2E gates", async () => {
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

test("DO_NOT_TRACK blocks capture, including after creating the hook", async () => {
  const events: unknown[] = [];
  const analytics = createSdkAnalytics({
    enabled: true,
    environment: "production",
    capture: (event) => {
      events.push(event);
    },
  });
  const previous = process.env.DO_NOT_TRACK;
  process.env.DO_NOT_TRACK = "1";
  try {
    await analytics.track("appsList", async () => ({}));
    assert.deepEqual(events, []);
  } finally {
    if (previous === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = previous;
  }
});

test("generated SDK accepts only explicitly allowed safe operation IDs", async () => {
  const events: unknown[] = [];
  const analytics = createSdkAnalytics({
    enabled: true,
    environment: "production",
    operations: ["notesList", "notesCreate", "https://private/path"] as const,
    capture: (event) => {
      events.push(event);
    },
  });
  await analytics.track("notesList", async () => ({}));
  await analytics.track("appsList" as never, async () => ({}));
  await analytics.track("https://private/path", async () => ({}));
  assert.deepEqual(events, [{ operation: "notesList", outcome: "success" }]);
});

test("browser doNotTrack blocks the owner sink", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const events: unknown[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { doNotTrack: "1" },
  });
  try {
    const analytics = createSdkAnalytics({
      enabled: true,
      environment: "production",
      capture: (event) => {
        events.push(event);
      },
    });
    await analytics.track("appsList", async () => ({}));
    assert.deepEqual(events, []);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});
