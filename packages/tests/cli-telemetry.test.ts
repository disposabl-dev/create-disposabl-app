import { createHash } from "node:crypto";
// The test workspace uses Node's ambient types; Bun supplies this module at runtime.
// @ts-expect-error bun:test is not included in the workspace's Node type set.
import { expect } from "bun:test";
import { afterEach, beforeEach, test } from "node:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { telemetryBuildDefine } from "../cli/telemetry-build";
import { createProgram } from "../cli/client";
import { login as oauthLogin } from "../cli/auth";
import {
  capture,
  identify,
  resetIdentity,
  prepareLogin,
  telemetryConfig,
  installedRelease,
} from "../cli/telemetry";

declare const Bun: {
  build(options: {
    entrypoints: string[];
    outdir: string;
    target: "bun";
    define: Record<string, string>;
  }): Promise<{ success: boolean }>;
};

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
  const attempt = await prepareLogin(path());
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("network");
  }) as typeof fetch;
  await expect(
    capture("1.2.3", "cli", "help", "success", path()),
  ).resolves.toBeUndefined();
  await expect(
    identify("1.2.3", "user_123", path(), attempt),
  ).resolves.toBeUndefined();
  expect(calls).toBe(2);
});

test("installed release follows global bin symlinks and rejects source links", async () => {
  const installed = join(home, "lib/node_modules/@disposabl/cli/dist/index.js");
  const source = join(home, "source/index.ts");
  const globalBin = join(home, "bin/disposabl");
  await mkdir(join(home, "lib/node_modules/@disposabl/cli/dist"), {
    recursive: true,
  });
  await mkdir(join(home, "bin"), { recursive: true });
  await mkdir(join(home, "source"), { recursive: true });
  await writeFile(installed, "");
  await writeFile(source, "");
  await symlink(installed, globalBin);
  expect(installedRelease("1.2.3", globalBin)).toBe(true);
  expect(installedRelease("1.2.3", installed)).toBe(true);
  expect(installedRelease("0.0.0-development", globalBin)).toBe(false);
  const sourceBin = join(home, "bin/source-cli");
  await symlink(source, sourceBin);
  expect(installedRelease("1.2.3", sourceBin)).toBe(false);
  expect(telemetryConfig("1.2.3", globalBin)).not.toBeNull();
  process.env.E2E_TELEMETRY_DISABLED = "1";
  expect(telemetryConfig("1.2.3", globalBin)).toBeNull();
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

test("login actions isolate a successful account when an overlapping login fails", async () => {
  let startFirst!: () => void;
  let startSecond!: () => void;
  let finishFirst!: () => void;
  let failSecond!: (error: Error) => void;
  const firstStarted = new Promise<void>((resolve) => {
    startFirst = resolve;
  });
  const secondStarted = new Promise<void>((resolve) => {
    startSecond = resolve;
  });
  let loginCalls = 0;
  let user = "user_123";
  const auth = {
    version: "1.2.3",
    telemetryPath: path(),
    login: async () => {
      loginCalls++;
      if (loginCalls === 1)
        return new Promise<void>((resolve) => {
          finishFirst = resolve;
          startFirst();
        });
      if (loginCalls === 2)
        return new Promise<void>((_resolve, reject) => {
          failSecond = reject;
          startSecond();
        });
    },
    loginAccessToken: async () => "fixture-token",
  };
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("/api/users/current"))
      return Response.json({ id: user });
    requests.push(JSON.parse(String(init?.body)));
    return new Response("1");
  }) as typeof fetch;
  const previousError = console.error;
  console.error = () => {};
  try {
    await capture("1.2.3", "cli", "agent", "started", path());
    const first = createProgram(
      "https://www.disposabl.dev",
      true,
      auth,
    ).parseAsync(["node", "cli", "login", "--no-browser"]);
    await firstStarted;
    const second = createProgram("https://www.disposabl.dev", true, auth)
      .parseAsync(["node", "cli", "login", "--no-browser"])
      .then(
        () => false,
        () => true,
      );
    await secondStarted;
    failSecond(new Error("fixture login denied"));
    expect(await second).toBe(true);
    finishFirst();
    await first;
    await capture("1.2.3", "cli", "agent", "success", path());
    const firstAccountActivity = requests.at(-1)!.distinct_id;
    expect(firstAccountActivity).not.toBe(requests[0].distinct_id);
    user = "user_456";
    await createProgram("https://www.disposabl.dev", true, auth).parseAsync([
      "node",
      "cli",
      "login",
      "--no-browser",
    ]);
    const identified = requests.at(-1)!;
    expect(identified.event).toBe("$identify");
    expect(identified.properties.$anon_distinct_id).not.toBe(
      firstAccountActivity,
    );
    expect(identified.properties.$anon_distinct_id).not.toBe(
      requests[0].distinct_id,
    );
  } finally {
    console.error = previousError;
  }
});

test(
  "real OAuth credential locking isolates an overlapping failed login",
  { timeout: 10_000 },
  async () => {
    process.env.DISPOSABL_CONFIG_DIR = join(home, "credentials");
    let registrations = 0;
    let loginCalls = 0;
    let secondStarted!: () => void;
    let authorizationReady!: (url: string) => void;
    const second = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const authorization = new Promise<string>((resolve) => {
      authorizationReady = resolve;
    });
    const origin = "https://www.disposabl.dev";
    const auth = {
      version: "1.2.3",
      telemetryPath: path(),
      login: async (url: string, browser?: boolean) => {
        loginCalls++;
        if (loginCalls === 2) secondStarted();
        return oauthLogin(url, browser);
      },
    };
    globalThis.fetch = (async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin === "https://us.i.posthog.com") {
        requests.push(JSON.parse(String(init?.body)));
        return new Response("1");
      }
      if (url.origin !== origin) throw new Error("Unexpected fixture request");
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
        return Response.json({
          resource: `${origin}/mcp`,
          authorization_servers: [origin],
        });
      if (url.pathname.startsWith("/.well-known/oauth-authorization-server"))
        return Response.json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      if (url.pathname === "/register") {
        registrations++;
        return registrations === 1
          ? Response.json({
              client_id: "fixture-client",
              token_endpoint_auth_method: "none",
            redirect_uris: JSON.parse(String(init?.body)).redirect_uris,
            })
          : Response.json(
              { error: "invalid_client_metadata" },
              { status: 400 },
            );
      }
      if (url.pathname === "/token")
        return Response.json({
          access_token: "fixture-token",
          token_type: "Bearer",
          expires_in: 3600,
        });
      if (url.pathname === "/api/users/current")
        return Response.json({ id: "user_123" });
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    }) as typeof fetch;
    const previousError = console.error;
    console.error = (message?: unknown) => {
      const match = String(message).match(
        /https:\/\/www\.disposabl\.dev\/authorize\?[^\s]+/,
      );
      if (match) authorizationReady(match[0]);
    };
    try {
      await capture("1.2.3", "cli", "agent", "started", path());
      const first = createProgram(origin, true, auth).parseAsync([
        "node",
        "cli",
        "login",
        "--no-browser",
      ]);
      const authorizeUrl = new URL(await authorization);
      const rejected = createProgram(origin, true, auth)
        .parseAsync(["node", "cli", "login", "--no-browser"])
        .then(
          () => false,
          () => true,
        );
      await second;
      const callback = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
      expect(callback.hostname).toBe("127.0.0.1");
      callback.searchParams.set("code", "fixture-code");
      callback.searchParams.set(
        "state",
        authorizeUrl.searchParams.get("state")!,
      );
      callback.searchParams.set("iss", origin);
      expect((await originalFetch(callback)).status).toBe(200);
      await first;
      expect(await rejected).toBe(true);
      await capture("1.2.3", "cli", "agent", "success", path());
      const firstAccountActivity = requests.at(-1)!.distinct_id;
      const third = await prepareLogin(path());
      await identify("1.2.3", "user_456", path(), third);
      expect(requests.at(-1)!.properties.$anon_distinct_id).not.toBe(
        firstAccountActivity,
      );
    } finally {
      console.error = previousError;
    }
  },
);

test("login status links an existing session only after verification and respects logout races", async () => {
  let credentials = true;
  let delayed = false;
  let finishStatus!: (response: Response) => void;
  let statusStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    statusStarted = resolve;
  });
  const auth = {
    version: "1.2.3",
    telemetryPath: path(),
    hasCredentials: async () => credentials,
    accessToken: async () => "fixture-token",
    logout: async () => {
      credentials = false;
    },
  };
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("/api/users/current")) {
      if (delayed)
        return new Promise<Response>((resolve) => {
          finishStatus = resolve;
          statusStarted();
        });
      return Response.json({ id: "user_123", username: "private" });
    }
    requests.push(JSON.parse(String(init?.body)));
    return new Response("1");
  }) as typeof fetch;
  const previousLog = console.log;
  const previousError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await capture("1.2.3", "generator", "create", "started", path());
    const anonymous = requests[0].distinct_id;
    await createProgram("https://www.disposabl.dev", true, auth).parseAsync([
      "node",
      "cli",
      "login",
      "status",
    ]);
    expect(requests[1]).toMatchObject({
      event: "$identify",
      properties: { $anon_distinct_id: anonymous },
    });
    expect(JSON.stringify(requests)).not.toContain("private");
    delayed = true;
    const status = createProgram(
      "https://www.disposabl.dev",
      true,
      auth,
    ).parseAsync(["node", "cli", "login", "status"]);
    await started;
    await createProgram("https://www.disposabl.dev", true, auth).parseAsync([
      "node",
      "cli",
      "logout",
    ]);
    finishStatus(Response.json({ id: "user_123" }));
    await status;
    expect(requests).toHaveLength(2);
    await capture("1.2.3", "cli", "agent", "started", path());
    expect(requests[2].distinct_id).not.toBe(anonymous);
    await createProgram("https://www.disposabl.dev", true, auth).parseAsync([
      "node",
      "cli",
      "login",
      "status",
    ]);
    expect(requests).toHaveLength(3);
  } finally {
    console.log = previousLog;
    console.error = previousError;
  }
});

test("rejected status never identifies an existing session", async () => {
  let checks = 0;
  const auth = {
    version: "1.2.3",
    telemetryPath: path(),
    hasCredentials: async () => true,
    accessToken: async () => "fixture-token",
  };
  globalThis.fetch = (async (url) => {
    expect(String(url)).toEndWith("/api/users/current");
    checks++;
    return new Response("unauthorized", { status: 401 });
  }) as typeof fetch;
  const previousLog = console.log;
  let printed = "";
  console.log = (value: unknown) => {
    printed = String(value);
  };
  try {
    await createProgram("https://www.disposabl.dev", true, auth).parseAsync([
      "node",
      "cli",
      "login",
      "status",
    ]);
    expect(checks).toBe(2);
    expect(JSON.parse(printed)).toEqual({ currentUser: null });
    expect(requests).toHaveLength(0);
  } finally {
    console.log = previousLog;
  }
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
    entrypoints: [join(import.meta.dirname, "../cli/telemetry.ts")],
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
