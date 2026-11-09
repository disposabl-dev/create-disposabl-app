import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
test("billing deletion policy and generic starter boundaries", () => {
  const result = spawnSync(
    process.execPath,
    ["test", join(import.meta.dirname, "components/billing-deletion.test.mjs")],
    { encoding: "utf8", env: { ...process.env, E2E_TELEMETRY_DISABLED: "1" } },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
