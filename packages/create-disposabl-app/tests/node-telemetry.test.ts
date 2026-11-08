import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capture,
  identify,
  resetIdentity,
  telemetryConfig,
} from "../../cli/telemetry";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalEntry = process.argv[1];
let home: string;
let requests: {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
}[];
const path = () => join(home, ".config/disposabl/telemetry.json");
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "disposabl-telemetry-test-"));
  process.env.HOME = home;
  process.env.NODE_ENV = "production";
  delete process.env.BUN_ENV;
  delete process.env.CI;
  delete process.env.E2E_TELEMETRY_DISABLED;
  delete process.env.DO_NOT_TRACK;
  delete process.env.DISPOSABL_TELEMETRY_DISABLED;
  delete process.env.DISPOSABL_API_KEY;
  delete process.env.DISPOSABL_API_ORIGIN;
  process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN = "phc_test";
  process.env.DISPOSABL_CLI_POSTHOG_HOST = "https://us.i.posthog.com";
  process.argv[1] = "/tmp/node_modules/@disposabl/cli/dist/index.js";
  requests = [];
  globalThis.fetch = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response("1", { status: 200 });
  }) as typeof fetch;
});
afterEach(async () => {
  process.env = { ...originalEnv };
  process.argv[1] = originalEntry;
  globalThis.fetch = originalFetch;
  await rm(home, { recursive: true, force: true });
});

test("source, development, tests, opt out and missing or unsafe config emit nothing", async () => {
  for (const [key, value] of [
    ["NODE_ENV", "test"],
    ["NODE_ENV", "development"],
    ["BUN_ENV", "test"],
    ["CI", "true"],
    ["E2E_TELEMETRY_DISABLED", "1"],
    ["DO_NOT_TRACK", "1"],
    ["DO_NOT_TRACK", "true"],
    ["DISPOSABL_TELEMETRY_DISABLED", "1"],
    ["DISPOSABL_API_KEY", "secret"],
    ["DISPOSABL_API_ORIGIN", "http://localhost:3000"],
    ["DISPOSABL_CLI_POSTHOG_HOST", "https://example.com"],
    ["DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN", "personal-key"],
  ]) {
    const previous = process.env[key];
    process.env[key] = value;
    await capture("1.2.3", "cli", "login", "started", path());
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  process.argv[1] = "/repo/packages/cli/index.ts";
  await capture("1.2.3", "cli", "login", "started", path());
  process.argv[1] = "/tmp/node_modules/@disposabl/cli/dist/index.js";
  await capture("0.0.0-development", "cli", "login", "started", path());
  expect(requests).toEqual([]);
  expect(telemetryConfig("1.2.3", "/repo/packages/cli/index.ts")).toBeNull();
});

test("anonymous events link on login and reset between users with only approved data", async () => {
  process.env.npm_command = "exec";
  await capture("1.2.3", "generator", "create", "started", path());
  expect(requests[0].properties.invocation).toBe("npx");
  const anonymous = requests[0].distinct_id;
  await identify("1.2.3", "user_123", path());
  await capture("1.2.3", "cli", "my-prompt-secret", "success", path());
  expect(requests[1]).toMatchObject({
    event: "$identify",
    distinct_id: "user_123",
    properties: { $anon_distinct_id: anonymous },
  });
  expect(requests[2]).toMatchObject({
    distinct_id: "user_123",
    properties: { command: "other", outcome: "success" },
  });
  expect(JSON.stringify(requests)).not.toContain("my-prompt-secret");
  expect(Object.keys(requests[2].properties).sort()).toEqual(
    [
      "$geoip_disable",
      "$ip",
      "command",
      "invocation",
      "outcome",
      "platform",
      "product",
      "version",
    ].sort(),
  );
  await resetIdentity(true, path());
  await capture("1.2.3", "cli", "login", "started", path());
  expect(requests[3].distinct_id).not.toBe(anonymous);
  expect(requests[3].distinct_id).not.toBe("user_123");
  await identify("1.2.3", "user_456", path());
  expect(requests[4].properties.$anon_distinct_id).toBe(
    requests[3].distinct_id,
  );
  expect(
    JSON.parse(
      await readFile(join(home, ".config/disposabl/telemetry.json"), "utf8"),
    ).userId,
  ).toBe("user_456");
});

test("transport failures do not escape", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network");
  }) as typeof fetch;
  await expect(
    capture("1.2.3", "cli", "help", "success", path()),
  ).resolves.toBeUndefined();
  await expect(identify("1.2.3", "user_123", path())).resolves.toBeUndefined();
});
