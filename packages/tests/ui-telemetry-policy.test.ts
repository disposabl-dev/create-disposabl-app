import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTelemetryEvent } from "../../apps/web/src/telemetry-policy";
import { screenCategory } from "../../apps/mobile/src/features/telemetry-policy";
import {
  publicReplayPath,
  replayProperties,
} from "../../apps/web/src/telemetry-replay";

test("replay only permits fixed public paths and validated session identifiers", () => {
  assert.equal(publicReplayPath("/"), true);
  for (const path of [
    "/signup",
    "/login",
    "/consent",
    "/apps/private",
    "/account",
    "/dashboard",
  ])
    assert.equal(publicReplayPath(path), false);
  const id = "01890abc-1234-7123-8123-123456789abc";
  assert.equal(
    replayProperties(
      {
        $snapshot_data: [],
        $snapshot_bytes: 1,
        $session_id: "private",
        $window_id: id,
      },
      "test",
      "id",
    ),
    null,
  );
  assert.deepEqual(
    replayProperties(
      {
        $snapshot_data: [],
        $snapshot_bytes: 1,
        $session_id: id,
        $window_id: id,
        secret: "drop",
      },
      "test",
      "id",
    ),
    {
      token: "test",
      distinct_id: "id",
      $snapshot_data: [],
      $snapshot_bytes: 1,
      $session_id: id,
      $window_id: id,
    },
  );
});

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
    $geoip_disable: true,
    platform: "web",
    page: "connections",
    $current_url: "https://www.disposabl.dev/dashboard/connections",
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
      $geoip_disable: true,
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
    $geoip_disable: true,
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
