import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProductAction,
  safeTelemetryEvent,
} from "../../apps/web/src/telemetry-policy";

test("setup interaction categories cannot carry clipboard content or bypass a lease", () => {
  const input = {
    active: true,
    now: 10,
    deadline: 20,
    page: "/?prompt=private-marker",
    source: "web" as const,
    projectToken: "public",
    distinctId: "opaque",
    clipboard: "private-marker",
  };
  for (const action of ["copy_setup", "open_setup"]) {
    assert.deepEqual(
      safeTelemetryEvent("product_action", { ...input, action }),
      {
        token: "public",
        distinct_id: "opaque",
        platform: "web",
        action,
      },
    );
    assert.equal(
      safeTelemetryEvent("product_action", { ...input, action, active: false }),
      null,
    );
    assert.equal(
      safeTelemetryEvent("product_action", { ...input, action, now: 20 }),
      null,
    );
  }
  for (const action of [
    null,
    {},
    "copy_setup:private-marker",
    "/private",
    "",
  ]) {
    assert.equal(isProductAction(action), false);
  }
});
