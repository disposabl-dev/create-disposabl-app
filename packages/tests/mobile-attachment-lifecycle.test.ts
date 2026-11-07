import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("mobile attachment lifecycle handles unmount and send races", () => {
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(
        import.meta.dirname,
        "components/mobile-attachment-lifecycle.test.mjs",
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
