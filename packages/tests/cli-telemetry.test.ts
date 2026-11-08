import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { telemetryBuildDefine } from "../cli/telemetry-build";
import {
  capture,
  identify,
  resetIdentity,
  prepareLogin,
  telemetryConfig,
} from "../cli/telemetry";

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
  const tempRoot = resolve(tmpdir());
  const realHome = resolve(homedir());
  if (tempRoot === realHome || tempRoot.startsWith(realHome + sep))
    throw new Error(
      "Tests require a temporary directory outside the home directory.",
    );
  home = await mkdtemp(join(tmpdir(), "disposabl-telemetry-test-"));
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
  const attempt = await prepareLogin(path());
  await identify("1.2.3", "user_123", path(), attempt);
  await capture("1.2.3", "cli", "my-prompt-secret", "success", path());
  expect(requests[1]).toMatchObject({
    event: "$identify",
    distinct_id: createHash("sha256")
      .update("disposabl:phc_test:user_123")
      .digest("hex"),
    properties: { $anon_distinct_id: anonymous },
  });
  expect(requests[2]).toMatchObject({
    distinct_id: createHash("sha256")
      .update("disposabl:phc_test:user_123")
      .digest("hex"),
    properties: { command: "other", outcome: "success" },
  });
  expect(JSON.stringify(requests)).not.toContain("my-prompt-secret");
  expect(JSON.stringify(requests)).not.toContain("user_123");
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
  await resetIdentity(path());
  await capture("1.2.3", "cli", "login", "started", path());
  expect(requests[3].distinct_id).not.toBe(anonymous);
  expect(requests[3].distinct_id).not.toBe("user_123");
  const nextAttempt = await prepareLogin(path());
  await identify("1.2.3", "user_456", path(), nextAttempt);
  expect(requests[4].properties.$anon_distinct_id).toBe(
    requests[3].distinct_id,
  );
  expect(
    JSON.parse(
      await readFile(join(home, ".config/disposabl/telemetry.json"), "utf8"),
    ).userId,
  ).toBe(
    createHash("sha256").update("disposabl:phc_test:user_456").digest("hex"),
  );
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

test("new login and logout invalidate concurrent identity attempts", async () => {
  await Promise.all(
    Array.from({ length: 4 }, () =>
      capture("1.2.3", "cli", "agent", "started", path()),
    ),
  );
  expect(new Set(requests.map((request) => request.distinct_id)).size).toBe(1);
  expect(
    requests.every((request) => request.properties.command === "agent"),
  ).toBe(true);
  const first = await prepareLogin(path());
  const second = await prepareLogin(path());
  await identify("1.2.3", "user_123", path(), first);
  expect(requests).toHaveLength(4);
  await identify("1.2.3", "user_456", path(), second);
  expect(requests).toHaveLength(5);
  const pending = await prepareLogin(path());
  await resetIdentity(path());
  await identify("1.2.3", "user_789", path(), pending);
  expect(requests).toHaveLength(5);
  await capture("1.2.3", "cli", "agent", "success", path());
  expect(requests[5].distinct_id).not.toBe(requests[4].distinct_id);
});

test("release builds require public ingestion config and embed it in the bundle", async () => {
  expect(() => telemetryBuildDefine("1.0.0", {})).toThrow("Release requires");
  expect(() =>
    telemetryBuildDefine("0.0.0-development", {
      DISPOSABL_CLI_TELEMETRY_REQUIRED: "1",
    }),
  ).toThrow("Release requires");
  expect(() =>
    telemetryBuildDefine("1.0.0", {
      DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN: "phx_secret",
      DISPOSABL_CLI_POSTHOG_HOST: "https://us.i.posthog.com",
    }),
  ).toThrow("Invalid");
  const define = telemetryBuildDefine("1.0.0", {
    DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN: "phc_fixture",
    DISPOSABL_CLI_POSTHOG_HOST: "https://eu.i.posthog.com",
  });
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../cli/telemetry.ts")],
    outdir: home,
    target: "bun",
    define,
  });
  expect(result.success).toBe(true);
  const bundle = await import(join(home, "telemetry.js"));
  process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN = "phc_wrong";
  process.env.DISPOSABL_CLI_POSTHOG_HOST = "https://us.i.posthog.com";
  expect(bundle.telemetryConfig("1.0.0", process.argv[1])).toEqual({
    token: "phc_fixture",
    host: "https://eu.i.posthog.com",
  });
  process.env.DO_NOT_TRACK = "1";
  expect(bundle.telemetryConfig("1.0.0", process.argv[1])).toBeNull();
});
