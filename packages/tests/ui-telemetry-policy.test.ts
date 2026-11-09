import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTelemetryEvent } from "../../apps/web/src/telemetry-policy";
import { screenCategory } from "../../apps/mobile/src/features/telemetry-policy";

test("mobile categories never expose app identifiers or unknown routes", () => {
  assert.equal(screenCategory("/apps/private-app-id"), "app_detail");
  assert.equal(screenCategory("/settings"), "settings");
  assert.equal(screenCategory("/unknown/private"), "other");
});

test("web events emit only fixed fields and stop at the lease deadline", () => {
  const input = {
    active: true,
    now: 10,
    deadline: 20,
    page: "/dashboard/connections/private?token=secret",
    source: "web" as const,
    projectToken: "public",
    distinctId: "server-id",
  };
  assert.deepEqual(safeTelemetryEvent("$pageview", input), {
    token: "public",
    distinct_id: "server-id",
    platform: "web",
    page: "connections",
  });
  assert.equal(safeTelemetryEvent("$autocapture", input), null);
  assert.equal(
    safeTelemetryEvent("product_action", { ...input, action: "private" }),
    null,
  );
  assert.deepEqual(
    safeTelemetryEvent("product_action", {
      ...input,
      action: "open_connections",
    }),
    {
      token: "public",
      distinct_id: "server-id",
      platform: "web",
      action: "open_connections",
    },
  );
  assert.equal(safeTelemetryEvent("$pageview", { ...input, now: 20 }), null);
  assert.equal(
    safeTelemetryEvent("$pageview", { ...input, active: false }),
    null,
  );
  assert.deepEqual(safeTelemetryEvent("$exception", input), {
    token: "public",
    distinct_id: "server-id",
    platform: "web",
    $exception_list: [
      {
        type: "Error",
        value: "Client error",
        mechanism: { handled: false, synthetic: true },
      },
    ],
  });
});
