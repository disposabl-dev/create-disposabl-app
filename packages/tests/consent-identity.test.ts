import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("consent displays only the current authenticated account", () => {
  const result = spawnSync(
    process.execPath,
    ["test", join(import.meta.dirname, "components/consent-identity.test.mjs")],
    { encoding: "utf8", env: process.env },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
