import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createUpdateController,
  feedUrl,
} from "../../apps/desktop/src/updates";

function setup(
  overrides: Partial<Parameters<typeof createUpdateController>[0]> = {},
) {
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
    assert.equal(
      feedUrl("https://example.com/my-app/", "production", "darwin", "arm64"),
      "https://example.com/my-app/production/darwin/arm64",
    );
    assert.equal(
      feedUrl("https://example.com/my-app", "pr-4", "win32", "x64"),
      "https://example.com/my-app/pr-4/win32/x64",
    );
    for (const base of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/?token=x",
    ])
      assert.equal(feedUrl(base, "production", "win32", "x64"), "");
    assert.equal(
      feedUrl("https://example.com", "../production", "win32", "x64"),
      "",
    );
  });
  test("does not report success for missing feed or unsupported Linux", () => {
    const missing = setup({ feed: "" });
    missing.updates.check();
    assert.equal(missing.starts(), 0);
    assert.ok(missing.messages[0].includes("not configured"));
    const linux = setup({ supported: false });
    linux.updates.check();
    assert.equal(linux.starts(), 0);
    assert.ok(linux.messages[0].includes("unavailable"));
  });
  test("serializes checks, retries after error, and retains downloaded update", async () => {
    const t = setup();
    t.updates.check();
    t.updates.check();
    assert.equal(t.starts(), 1);
    t.updates.error();
    assert.equal(t.updates.state, "idle");
    t.updates.check();
    assert.equal(t.starts(), 2);
    t.updates.available();
    assert.equal(t.updates.state, "downloading");
    t.updates.downloaded();
    await Promise.resolve();
    assert.equal(t.updates.state, "ready");
    t.updates.check();
    await Promise.resolve();
    assert.equal(t.starts(), 2);
    assert.equal(t.installs(), 0);
  });
  test("only confirmed downloaded updates install", async () => {
    const t = setup({ confirmRestart: async () => true });
    t.updates.check();
    t.updates.downloaded();
    await Promise.resolve();
    assert.equal(t.installs(), 1);
    const no = setup();
    no.updates.check();
    no.updates.unavailable();
    assert.ok(no.messages.includes("This app is up to date."));
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
      spawnSync("node", [join(root, "apps/desktop/stage-update.mjs")], {
        env: { ...env, ...values },
        stdio: "pipe",
      });
    assert.equal(run({}).status, 0);
    assert.equal(
      await readFile(
        join(root, "dist/update/preview/win32/x64/app-1.0.2-full.nupkg"),
        "utf8",
      ),
      "package",
    );
    await writeFile(join(root, "dist/release/app.zip"), "zip");
    assert.equal(
      run({ DISPOSABL_DESKTOP_PLATFORM: "macos", MACOS_NOTARIZE: "false" })
        .status,
      0,
    );
    assert.equal(
      await access(join(root, "dist/update/preview/darwin")).then(
        () => true,
        () => false,
      ),
      false,
    );
    assert.equal(
      run({ DISPOSABL_DESKTOP_PLATFORM: "macos", MACOS_NOTARIZE: "true" })
        .status,
      0,
    );
    const manifest = JSON.parse(
      await readFile(
        join(root, "dist/update/preview/darwin/arm64/RELEASES.json"),
        "utf8",
      ),
    );
    assert.equal(
      manifest.releases[0].updateTo.url,
      "https://example.com/app/preview/darwin/arm64/app.zip",
    );
    assert.notEqual(
      run({ DISPOSABL_DESKTOP_UPDATE_CHANNEL: "../production" }).status,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("waits for the Windows installer lock before checking", () => {
  let now = 0;
  const t = setup({ now: () => now, readyAt: 10_000 });
  t.updates.check();
  assert.equal(t.starts(), 0);
  assert.ok(t.messages[0].includes("Finishing installation"));
  now = 10_000;
  t.updates.check();
  assert.equal(t.starts(), 1);
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
  assert.equal(t.updates.state, "ready");
  assert.ok(t.messages.at(-1)?.includes("Could not restart"));
  reject = false;
  t.updates.check();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(t.installs(), 1);
  t.updates.error();
  assert.equal(t.updates.state, "ready");
  assert.ok(t.messages.at(-1)?.includes("Could not restart"));
});
