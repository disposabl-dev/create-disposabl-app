import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const url = process.env.MCP_ERASURE_FIXTURE_URL;
if (url && url !== "http://127.0.0.1:3550")
  throw new Error("MCP erasure fixture must use port 3550 on loopback");

test(
  "MCP component erases attributable credentials on the local fixture",
  { skip: !url, timeout: 120000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        "test",
        join(
          import.meta.dirname,
          "fixtures/mcp-erasure-convex/component/mcp-erasure.test.ts",
        ),
      ],
      {
        encoding: "utf8",
        env: process.env,
        timeout: 120000,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  },
);
