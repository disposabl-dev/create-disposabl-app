import { describe, expect, test } from "bun:test";
import { createUpdateController, feedUrl } from "../../apps/desktop/src/updates";

function setup(overrides: Partial<Parameters<typeof createUpdateController>[0]> = {}) {
  const messages: string[] = [];
  let starts = 0;
  let installs = 0;
  const updates = createUpdateController({
    supported: true,
    feed: "https://updates.example/production/win32/x64",
    start: () => {
      starts++;
    },
    install: () => {
      installs++;
    },
    show: (_kind, message) => messages.push(message),
    confirmRestart: async () => false,
    ...overrides,
  });
  return { updates, messages, starts: () => starts, installs: () => installs };
}

describe("desktop updates", () => {
  test("isolates feeds and rejects unsafe configuration", () => {
    expect(feedUrl("https://example.com/my-app/", "production", "darwin", "arm64")).toBe(
      "https://example.com/my-app/production/darwin/arm64",
    );
    expect(feedUrl("https://example.com/my-app", "pr-4", "win32", "x64")).toBe(
      "https://example.com/my-app/pr-4/win32/x64",
    );
    for (const base of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/?token=x",
    ])
      expect(feedUrl(base, "production", "win32", "x64")).toBe("");
    expect(feedUrl("https://example.com", "../production", "win32", "x64")).toBe("");
  });
  test("does not report success for missing feed or unsupported Linux", () => {
    const missing = setup({ feed: "" });
    missing.updates.check();
    expect(missing.starts()).toBe(0);
    expect(missing.messages[0]).toContain("not configured");
    const linux = setup({ supported: false });
    linux.updates.check();
    expect(linux.starts()).toBe(0);
    expect(linux.messages[0]).toContain("unavailable");
  });
  test("serializes checks, retries after error, and retains downloaded update", async () => {
    const t = setup();
    t.updates.check();
    t.updates.check();
    expect(t.starts()).toBe(1);
    t.updates.error();
    expect(t.updates.state).toBe("idle");
    t.updates.check();
    expect(t.starts()).toBe(2);
    t.updates.available();
    expect(t.updates.state).toBe("downloading");
    t.updates.downloaded();
    await Promise.resolve();
    expect(t.updates.state).toBe("ready");
    t.updates.check();
    await Promise.resolve();
    expect(t.starts()).toBe(2);
    expect(t.installs()).toBe(0);
  });
  test("only confirmed downloaded updates install", async () => {
    const t = setup({ confirmRestart: async () => true });
    t.updates.check();
    t.updates.downloaded();
    await Promise.resolve();
    expect(t.installs()).toBe(1);
    const no = setup();
    no.updates.check();
    no.updates.unavailable();
    expect(no.messages).toContain("This app is up to date.");
  });
});

test("stages isolated Squirrel feeds and refuses ad-hoc macOS feeds", async () => {
  const { mkdtemp, mkdir, copyFile, writeFile, readFile, rm, access } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "desktop-feed-"));
  try {
    await mkdir(join(root, "apps/desktop"), { recursive: true });
    await mkdir(join(root, "dist/release"), { recursive: true });
    await copyFile(
      new URL("../../apps/desktop/stage-update.mjs", import.meta.url),
      join(root, "apps/desktop/stage-update.mjs"),
    );
    await writeFile(join(root, "dist/release/app-1.0.2-full.nupkg"), "package");
    await writeFile(
      join(root, "dist/release/RELEASES"),
      `${"a".repeat(40)} app-1.0.2-full.nupkg 7\n`,
    );
    const env = {
      ...process.env,
      DISPOSABL_DESKTOP_UPDATE_URL: "https://example.com/app",
      DISPOSABL_DESKTOP_UPDATE_CHANNEL: "preview",
      DISPOSABL_DESKTOP_PLATFORM: "windows",
      DISPOSABL_RELEASE_VERSION: "1.0.2",
    };
    const run = (values: Record<string, string>) =>
      Bun.spawnSync(["node", join(root, "apps/desktop/stage-update.mjs")], {
        env: { ...env, ...values },
        stdout: "pipe",
        stderr: "pipe",
      });
    expect(run({}).exitCode).toBe(0);
    expect(
      await readFile(join(root, "dist/update/preview/win32/x64/app-1.0.2-full.nupkg"), "utf8"),
    ).toBe("package");
    await writeFile(join(root, "dist/release/app.zip"), "zip");
    expect(run({ DISPOSABL_DESKTOP_PLATFORM: "macos", MACOS_NOTARIZE: "false" }).exitCode).toBe(0);
    expect(
      await access(join(root, "dist/update/preview/darwin")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(run({ DISPOSABL_DESKTOP_PLATFORM: "macos", MACOS_NOTARIZE: "true" }).exitCode).toBe(0);
    const manifest = JSON.parse(
      await readFile(join(root, "dist/update/preview/darwin/arm64/RELEASES.json"), "utf8"),
    );
    expect(manifest.releases[0].updateTo.url).toBe(
      "https://example.com/app/preview/darwin/arm64/app.zip",
    );
    expect(run({ DISPOSABL_DESKTOP_UPDATE_CHANNEL: "../production" }).exitCode).not.toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("waits for the Windows installer lock before checking", () => {
  let now = 0;
  const t = setup({ now: () => now, readyAt: 10_000 });
  t.updates.check();
  expect(t.starts()).toBe(0);
  expect(t.messages[0]).toContain("Finishing installation");
  now = 10_000;
  t.updates.check();
  expect(t.starts()).toBe(1);
});

test("reports restart errors while preserving the downloaded update for retry", async () => {
  let reject = true;
  const t = setup({
    confirmRestart: async () => {
      if (reject) throw new Error("dialog closed");
      return true;
    },
  });
  t.updates.check();
  t.updates.downloaded();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(t.updates.state).toBe("ready");
  expect(t.messages.at(-1)).toContain("Could not restart");
  reject = false;
  t.updates.check();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(t.installs()).toBe(1);
  t.updates.error();
  expect(t.updates.state).toBe("ready");
  expect(t.messages.at(-1)).toContain("Could not restart");
});
