import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { capture } from "../cli/telemetry";

test("production first executions are deduplicated per package and version", async () => {
  const env = { ...process.env };
  const oldFetch = globalThis.fetch;
  const oldEntry = process.argv[1];
  const home = await mkdtemp(join(tmpdir(), "disposabl-first-execution-"));
  const path = join(home, "telemetry.json");
  const events: any[] = [];
  try {
    process.env.DISPOSABL_CONFIG_DIR = join(home, "credentials");
    process.env.NODE_ENV = "production";
    for (const key of [
      "BUN_ENV",
      "CI",
      "E2E_TELEMETRY_DISABLED",
      "DO_NOT_TRACK",
      "DISPOSABL_API_KEY",
      "DISPOSABL_API_ORIGIN",
    ])
      delete process.env[key];
    process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN = "phc_fixture";
    process.env.DISPOSABL_CLI_POSTHOG_HOST = "https://us.i.posthog.com";
    process.argv[1] = "/tmp/node_modules/@disposabl/cli/dist/index.js";
    globalThis.fetch = (async (_url, init) => {
      events.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    for (const [key, value] of [
      ["DISPOSABL_TELEMETRY_DISABLED", "1"],
      ["E2E_TELEMETRY_DISABLED", "1"],
      ["DO_NOT_TRACK", "1"],
      ["CI", "true"],
      ["NODE_ENV", "development"],
      ["NODE_ENV", "test"],
    ]) {
      process.env[key] = value;
      await capture("1.0.0", "cli", "secret-prompt", "started", path);
      if (key === "NODE_ENV") process.env.NODE_ENV = "production";
      else delete process.env[key];
    }
    await assert.rejects(readdir(join(home, "activations")), {
      code: "ENOENT",
    });
    assert.equal(events.length, 0);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        capture("1.0.0", "cli", "secret-prompt", "started", path),
      ),
    );
    assert.equal(events.length, 4);
    assert.equal(
      events.filter((e) => e.properties.first_execution === true).length,
      1,
    );
    await capture("1.0.0", "cli", "help", "success", path);
    await capture("1.0.1", "cli", "help", "started", path);
    await capture("1.0.1", "cli", "help", "started", path);
    await capture("1.0.0", "generator", "create", "started", path);
    assert.equal(
      events.filter((e) => e.properties.first_execution === true).length,
      3,
    );
    assert.deepEqual(
      events
        .filter((e) => e.properties.first_execution)
        .map((e) => [e.properties.product, e.properties.version])
        .sort(),
      [
        ["cli", "1.0.0"],
        ["cli", "1.0.1"],
        ["generator", "1.0.0"],
      ],
    );
    assert.equal((await readdir(join(home, "activations"))).length, 3);
    assert.doesNotMatch(JSON.stringify(events), /secret-prompt/);
  } finally {
    globalThis.fetch = oldFetch;
    process.argv[1] = oldEntry;
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await rm(home, { recursive: true, force: true });
  }
});

test("activation transport failure remains best effort and does not replay", async () => {
  const env = { ...process.env };
  const oldFetch = globalThis.fetch;
  const oldEntry = process.argv[1];
  const home = await mkdtemp(join(tmpdir(), "disposabl-first-execution-"));
  try {
    process.env.DISPOSABL_CONFIG_DIR = join(home, "credentials");
    process.env.NODE_ENV = "production";
    for (const key of [
      "BUN_ENV",
      "CI",
      "E2E_TELEMETRY_DISABLED",
      "DO_NOT_TRACK",
      "DISPOSABL_TELEMETRY_DISABLED",
      "DISPOSABL_API_KEY",
      "DISPOSABL_API_ORIGIN",
    ])
      delete process.env[key];
    process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN = "phc_fixture";
    process.env.DISPOSABL_CLI_POSTHOG_HOST = "https://us.i.posthog.com";
    process.argv[1] = "/tmp/node_modules/@disposabl/cli/dist/index.js";
    const events: any[] = [];
    globalThis.fetch = (async (_url, init) => {
      events.push(JSON.parse(String(init?.body)));
      throw new Error("synthetic");
    }) as typeof fetch;
    const path = join(home, "telemetry.json");
    await capture("2.0.0", "cli", "help", "started", path);
    await capture("2.0.0", "cli", "help", "started", path);
    assert.equal(events.length, 2);
    assert.equal(events.filter((e) => e.properties.first_execution).length, 1);
  } finally {
    globalThis.fetch = oldFetch;
    process.argv[1] = oldEntry;
    for (const key of Object.keys(process.env))
      if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await rm(home, { recursive: true, force: true });
  }
});
