import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("support page shows the configured contact or an unconfigured state", () => {
  const result = spawnSync(
    process.execPath,
    ["test", join(import.meta.dirname, "components/support-page.test.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
