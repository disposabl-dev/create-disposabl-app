import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function probe(variables: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "test",
      join(import.meta.dirname, "helpers/auth-email-setup/probe.test.mjs"),
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "test",
        CI: "1",
        DO_NOT_TRACK: "1",
        E2E_TELEMETRY_DISABLED: "1",
        CONVEX_SITE_URL: "http://127.0.0.1:3481",
        ...variables,
      },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("email setup uses the built-in site URL without a sender", () => {
  probe({ EXPECT_ORIGIN: "http://127.0.0.1:3481" });
});

test("email setup uses a valid explicit origin", () => {
  probe({
    AUTH_EMAIL_ORIGIN: "https://mail.example.invalid",
    EXPECT_ORIGIN: "https://mail.example.invalid",
  });
});

test("email setup rejects a malformed explicit origin", () => {
  probe({ AUTH_EMAIL_ORIGIN: "localhost:5173", EXPECT_INVALID: "1" });
});
