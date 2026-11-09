import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  createLocalCli,
  inspectCliCallback,
} from "./helpers/cli-oauth-fixture";

test("local OAuth fixture bundles its actual entry without touching the service", async () => {
  const fixture = await createLocalCli(
    resolve(import.meta.dirname, "../.."),
    "http://127.0.0.1:3311",
  );
  try {
    assert.equal(fixture.published, false);
    assert.ok(fixture.entry);
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

test("CLI callback checks binding and fails closed on inspection errors", () => {
  const result =
    (status: number | null, stdout = "", stderr = "", error?: Error) =>
    () => ({ status, stdout, stderr, error });
  inspectCliCallback(49152, 123, result(0, "p123\nf9\nn127.0.0.1:49152\n"));
  for (const address of [
    "*:49152",
    "0.0.0.0:49152",
    "[::]:49152",
    "127.0.0.2:49152",
  ])
    assert.throws(() =>
      inspectCliCallback(49152, 123, result(0, `p123\nn${address}`)),
    );
  assert.throws(() =>
    inspectCliCallback(49152, 123, result(0, "p124\nn127.0.0.1:49152")),
  );
  assert.throws(() =>
    inspectCliCallback(
      49152,
      123,
      result(0, "p123\nn127.0.0.1:49152\np124\nn*:49152"),
    ),
  );
  inspectCliCallback(49152, undefined, result(1));
  for (const inspection of [
    result(1, "", "lsof: denied"),
    result(1, "p123"),
    result(0),
    result(2),
    result(null, "", "", new Error("spawn failed")),
  ])
    assert.throws(() => inspectCliCallback(49152, undefined, inspection));
});
