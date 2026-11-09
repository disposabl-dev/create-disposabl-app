import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("simulator preflight validates platform, entitlements and inputs", () => {
  const directory = fileURLToPath(new URL("./helpers/mobile-simulator", import.meta.url));
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", directory, "-p", "test_preflight.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
