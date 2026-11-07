import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("OTA component lifecycle regressions", () => {
  // Keep native module mocks out of the backend and generator unit suites.
  const result = spawnSync(
    process.execPath,
    ["test", join(import.meta.dirname, "components/mobile-updates.test.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
