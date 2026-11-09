import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("pricing handlers report only safe, gated billing attempts", () => {
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(import.meta.dirname, "components/web-billing-attempts.test.mjs"),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, E2E_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
