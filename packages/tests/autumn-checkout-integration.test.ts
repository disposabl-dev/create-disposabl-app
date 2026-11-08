import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("checkout and setup handlers use the HTTP provider boundary", () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/autumn-checkout/harness.ts", import.meta.url),
  );
  const result = spawnSync(process.execPath, [fixture], {
    encoding: "utf8",
    env: { ...process.env, E2E_TELEMETRY_DISABLED: "1" },
    timeout: 20_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /HTTP fixture:.*passed/);
});
