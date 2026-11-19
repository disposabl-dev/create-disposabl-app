import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("app host allocation, lifecycle and public presentation", () => {
  const result = spawnSync(
    process.execPath,
    ["test", `${import.meta.dirname}/components/gateway-model.test.ts`],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
