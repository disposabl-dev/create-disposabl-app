import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../cli/commands";

test("CLI version and help return through the command lifecycle", async () => {
  const exit = process.exit;
  const write = process.stdout.write;
  try {
    process.exit = (() => {
      throw new Error("unexpected immediate exit");
    }) as typeof process.exit;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await assert.doesNotReject(runCli(["node", "disposabl", "--version"]));
    await assert.doesNotReject(runCli(["node", "disposabl", "--help"]));
  } finally {
    process.exit = exit;
    process.stdout.write = write;
  }
});
