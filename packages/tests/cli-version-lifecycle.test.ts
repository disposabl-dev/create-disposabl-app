import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../cli/commands";

test("CLI version and help return through the command lifecycle", async () => {
  const exit = process.exit;
  const write = process.stdout.write;
  const fetch = globalThis.fetch;
  const apiKey = process.env.DISPOSABL_API_KEY;
  const origin = "https://cli-lifecycle.invalid";
  const requests: string[] = [];
  try {
    globalThis.fetch = (async (url) => {
      requests.push(String(url));
      if (String(url) === `${origin}/api/users/current`)
        return Response.json({ id: "synthetic" });
      assert.equal(String(url), `${origin}/openapi.json`);
      return Response.json({
        paths: {
          "/api/users/current": { get: { operationId: "usersCurrent" } },
        },
      });
    }) as typeof globalThis.fetch;
    process.exit = (() => {
      throw new Error("unexpected immediate exit");
    }) as typeof process.exit;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await assert.doesNotReject(
      runCli(["node", "disposabl", "--version"], origin),
    );
    assert.deepEqual(requests, []);
    for (const args of [["--help"], ["-h"], ["help"], []]) {
      await assert.doesNotReject(
        runCli(["node", "disposabl", ...args], origin),
      );
      assert.deepEqual(requests, []);
    }
    await assert.doesNotReject(
      runCli(["node", "disposabl", "users", "current", "--help"], origin),
    );
    assert.deepEqual(requests, [`${origin}/openapi.json`]);
    await assert.rejects(runCli(["node", "disposabl", "--invalid"], origin));
    assert.deepEqual(requests, [`${origin}/openapi.json`]);
    process.env.DISPOSABL_API_KEY = "synthetic-test-key";
    await assert.doesNotReject(
      runCli(["node", "disposabl", "users", "current"], origin),
    );
    assert.deepEqual(requests, [
      `${origin}/openapi.json`,
      `${origin}/openapi.json`,
      `${origin}/api/users/current`,
    ]);
  } finally {
    if (apiKey === undefined) delete process.env.DISPOSABL_API_KEY;
    else process.env.DISPOSABL_API_KEY = apiKey;
    globalThis.fetch = fetch;
    process.exit = exit;
    process.stdout.write = write;
  }
});
