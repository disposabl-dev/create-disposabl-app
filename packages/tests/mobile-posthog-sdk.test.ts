import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("actual mobile PostHog SDK honors isolated consent", () => {
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(import.meta.dirname, "components/mobile-posthog-sdk.test.mjs"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
