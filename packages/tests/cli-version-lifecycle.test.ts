import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../cli/commands";

test("CLI version and help return through the command lifecycle", async () => {
  const exit = process.exit;
  const write = process.stdout.write;
  const fetch = globalThis.fetch;
  const origin = "https://cli-lifecycle.invalid";
  const requests: string[] = [];
  try {
    globalThis.fetch = (async (url) => {
      requests.push(String(url));
      assert.equal(String(url), `${origin}/openapi.json`);
      return Response.json({ paths: {} });
    }) as typeof globalThis.fetch;
    process.exit = (() => {
      throw new Error("unexpected immediate exit");
    }) as typeof process.exit;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await assert.doesNotReject(
      runCli(["node", "disposabl", "--version"], origin),
    );
    assert.deepEqual(requests, []);
    await assert.doesNotReject(runCli(["node", "disposabl", "--help"], origin));
    assert.deepEqual(requests, [`${origin}/openapi.json`]);
  } finally {
    globalThis.fetch = fetch;
    process.exit = exit;
    process.stdout.write = write;
  }
});
