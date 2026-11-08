import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createLocalCli } from "./helpers/cli-oauth-fixture";

test("local OAuth fixture bundles its actual entry without touching the service", async () => {
  const fixture = await createLocalCli(
    resolve(import.meta.dirname, "../.."),
    "http://127.0.0.1:3311",
  );
  try {
    const source = await readFile(fixture.entry, "utf8");
    assert.equal(source.includes("\\n"), false);
    assert.equal(source.split("\n").length, 3);
    const result = await promisify(execFile)(
      "node",
      [fixture.binary, "--version"],
      { env: fixture.env, timeout: 10_000 },
    );
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
  } finally {
    await fixture.cleanup();
  }
});
