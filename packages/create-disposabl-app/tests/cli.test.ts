import { afterAll, beforeAll, expect, test } from "bun:test";
import { version } from "../package.json";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "disposabl-cli-test-"));
const cli = join(packageRoot, "dist/index.js");

beforeAll(() => {
  const result = spawnSync("bun", ["build.ts"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(...args: string[]) {
  const result = spawnSync("node", [cli, ...args], {
    cwd: scratch,
    encoding: "utf8",
    input: "",
    timeout: 10_000,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  if (result.error) throw result.error;
  return result;
}

function appFolders(name: string) {
  return readdirSync(join(scratch, name, "apps")).sort();
}

async function config(name: string) {
  return Bun.file(join(scratch, name, "disposabl.json")).json();
}

test("all app folders stay in the source and bundle", () => {
  const expected = ["blog", "changelog", "desktop", "docs", "mobile", "web"];
  expect(readdirSync(resolve(packageRoot, "../../apps")).sort()).toEqual(
    expected,
  );
  expect(
    readdirSync(join(packageRoot, "dist/templates/default/apps")).sort(),
  ).toEqual(expected);
  for (const folder of expected) {
    expect(
      JSON.parse(
        readFileSync(
          resolve(packageRoot, "../../apps", folder, "package.json"),
          "utf8",
        ),
      ),
    ).toEqual({});
  }
});

test("non-interactive defaults create only Web with no appId or deployment credentials", async () => {
  const result = run("minimal", "--yes", "--skip-install", "--json");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "created",
    configFile: "disposabl.json",
    platforms: ["web"],
    features: [],
    folders: ["apps/web"],
    installed: false,
  });
  expect(appFolders("minimal")).toEqual(["web"]);
  expect(await config("minimal")).toEqual({
    version: version,
    platforms: ["web"],
    features: [],
  });
  expect(readdirSync(join(scratch, "minimal")).sort()).toEqual([
    ".gitignore",
    "LICENSE",
    "apps",
    "disposabl.json",
    "package.json",
  ]);
  expect(
    JSON.parse(readFileSync(join(scratch, "minimal/package.json"), "utf8")),
  ).toMatchObject({
    name: "minimal",
    private: true,
    workspaces: ["apps/*", "packages/*"],
  });
});

test("all enabled choices retain the selected empty apps and exact configuration", async () => {
  const platforms = [
    "web",
    "android",
    "ios",
    "windows",
    "linux",
    "macos",
    "mcp",
    "openai-plugin",
    "claude-code-plugin",
  ];
  const features = ["docs", "blog", "changelog", "authentication"];
  const result = run(
    "everything",
    "--platforms",
    platforms.join(","),
    "--features",
    features.join(","),
    "--skip-install",
    "--json",
  );
  expect(result.status).toBe(0);
  expect(await config("everything")).toEqual({
    version: version,
    platforms,
    features,
  });
  expect(appFolders("everything")).toEqual([
    "blog",
    "changelog",
    "desktop",
    "docs",
    "mobile",
    "web",
  ]);
  for (const folder of appFolders("everything"))
    expect(
      JSON.parse(
        readFileSync(
          join(scratch, "everything/apps", folder, "package.json"),
          "utf8",
        ),
      ),
    ).toEqual({});
  expect(
    existsSync(join(scratch, "everything/packages/create-disposabl-app")),
  ).toBe(false);
  expect(
    existsSync(join(scratch, "everything/.github/workflows/publish.yml")),
  ).toBe(false);
});

test.each([
  ["android", "mobile"],
  ["ios", "mobile"],
  ["windows", "desktop"],
  ["linux", "desktop"],
  ["macos", "desktop"],
])(
  "%s retains its app folder and always includes Web",
  async (platform, folder) => {
    const result = run(
      platform,
      "--platforms",
      platform,
      "--skip-install",
      "--json",
    );
    expect(result.status).toBe(0);
    expect(appFolders(platform)).toEqual([folder, "web"]);
    expect(await config(platform)).toEqual({
      version: version,
      platforms: ["web", platform],
      features: [],
    });
  },
);

test.each(["docs", "blog", "changelog"])(
  "%s retains only its feature folder alongside Web",
  (feature) => {
    const result = run(
      feature,
      "--features",
      feature,
      "--skip-install",
      "--json",
    );
    expect(result.status).toBe(0);
    expect(appFolders(feature)).toEqual([feature, "web"]);
  },
);

test("Authentication only records a choice, without adding files or dependencies", async () => {
  const result = run(
    "auth-only",
    "--features",
    "authentication",
    "--skip-install",
    "--json",
  );
  expect(result.status).toBe(0);
  expect(appFolders("auth-only")).toEqual(["web"]);
  expect(await config("auth-only")).toEqual({
    version: version,
    platforms: ["web"],
    features: ["authentication"],
  });
  expect(
    JSON.parse(readFileSync(join(scratch, "auth-only/package.json"), "utf8"))
      .dependencies,
  ).toBeUndefined();
});

test.each(["api", "cli", "python-sdk", "typescript-sdk"])(
  "disabled platform %s fails before creating files",
  (platform) => {
    const name = "disabled-" + platform;
    const result = run(
      name,
      "--platforms",
      platform,
      "--skip-install",
      "--json",
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).message).toContain("not available yet");
    expect(existsSync(join(scratch, name))).toBe(false);
  },
);

test("unknown choices and missing arguments return actionable JSON errors without prompting", () => {
  for (const args of [
    ["bad-platform", "--platforms", "typo"],
    ["bad-feature", "--features", "typo"],
    ["missing-value", "--features"],
    [],
  ]) {
    const result = run(...args, "--json");
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "error",
      message: expect.any(String),
    });
  }
});

test("existing destinations are preserved even with --yes", () => {
  mkdirSync(join(scratch, "existing"));
  writeFileSync(join(scratch, "existing/keep.txt"), "keep me");
  const result = run("existing", "--yes", "--skip-install", "--json");
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).message).toContain(
    "Directory already exists",
  );
  expect(readFileSync(join(scratch, "existing/keep.txt"), "utf8")).toBe(
    "keep me",
  );
  expect(readdirSync(join(scratch, "existing"))).toEqual(["keep.txt"]);
});

test("agents can discover required, available, and disabled options as JSON", () => {
  const result = run("--list-options", "--json");
  expect(result.status).toBe(0);
  const options = JSON.parse(result.stdout);
  expect(
    options.platforms.find((platform: { id: string }) => platform.id === "web")
      .status,
  ).toBe("required");
  expect(
    options.platforms
      .filter((platform: { status: string }) => platform.status === "disabled")
      .map((platform: { id: string }) => platform.id),
  ).toEqual(["api", "cli", "python-sdk", "typescript-sdk"]);
  expect(options.configOnly).toContain("authentication");
  expect(options.platformDependencies).toEqual({
    "openai-plugin": ["mcp"],
    "claude-code-plugin": ["mcp"],
  });
});

for (const plugin of ["openai-plugin", "claude-code-plugin"]) {
  test(`${plugin} flags include MCP in JSON and the generated config`, async () => {
    const result = run(
      plugin,
      "--platforms",
      plugin,
      "--skip-install",
      "--json",
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).platforms).toEqual(["web", "mcp", plugin]);
    expect((await config(plugin)).platforms).toEqual(["web", "mcp", plugin]);
    expect(appFolders(plugin)).toEqual(["web"]);
  });
}

test("bun install supports the empty workspaces and keeps JSON stdout clean", () => {
  const result = run("installed", "--features", "docs,blog", "--json");
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "created",
    installed: true,
  });
  expect(appFolders("installed")).toEqual(["blog", "docs", "web"]);
  const dev = spawnSync("bun", ["run", "dev"], {
    cwd: join(scratch, "installed"),
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(dev.status).toBe(0);
});

test("human output keeps one setup table and concise next steps", () => {
  const result = run("clean-output", "--yes");
  expect(result.status).toBe(0);
  expect(result.stdout.match(/App Setup/g)).toHaveLength(1);
  expect(result.stdout).toContain("Disposabl Version │ " + version);
  expect(result.stdout).not.toContain("Create a Disposabl app");
  expect(result.stdout).toMatch(/Installation\s+│ Complete \(\d+\.\d{2}s\)/);
  expect(result.stdout).toContain("cd clean-output\n  bun run dev");
  expect(result.stdout).toMatch(/App\s+│ clean-output/);
  expect(result.stdout).not.toContain("disposabl.json");
  expect(result.stdout).not.toMatch(/│ Setup\s+│/);
  expect(result.stdout).not.toContain("Created clean-output");
  expect(result.stdout).not.toContain("apps/web/package.json");
});

test("failed installation leaves the setup table marked Failed", () => {
  const bin = join(scratch, "fake-bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "bun"),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\necho "Install failed" >&2\nexit 1\n',
    { mode: 0o755 },
  );
  const result = spawnSync("node", [cli, "failed-install", "--yes"], {
    cwd: scratch,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      NO_COLOR: "1",
      CI: "1",
    },
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toMatch(/Installation\s+│ Failed \(\d+\.\d{2}s\)/);
  expect(result.stdout).not.toContain("Next steps");
  expect(existsSync(join(scratch, "failed-install/disposabl.json"))).toBe(true);
});
