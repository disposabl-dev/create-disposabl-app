import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("wildcard gateway preserves tenant isolation, paths and outage semantics", () => {
  const result = spawnSync(
    process.execPath,
    ["test", `${import.meta.dirname}/components/gateway-middleware.test.ts`],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
