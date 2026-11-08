import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("account deletion UI handles authentication and request states", () => {
  for (const disabled of ["true", "false"]) {
    const result = spawnSync(
      process.execPath,
      [
        "test",
        join(import.meta.dirname, "components/account-deletion.test.mjs"),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, TEST_AUTH_DISABLED: disabled },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});
