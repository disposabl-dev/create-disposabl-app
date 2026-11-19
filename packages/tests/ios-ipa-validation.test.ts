import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runtime = "a".repeat(40);
const plist = (entries: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${entries}</dict></plist>`;
const field = (key: string, value: string) =>
  `<key>${key}</key><string>${value}</string>`;

test(
  "signed iOS app validation resolves Expo fingerprint and rejects mismatches",
  { skip: process.platform !== "darwin" },
  async () => {
    const app = await mkdtemp(join(tmpdir(), "ios-ipa-validation-"));
    try {
      const info = async (id = "app.test", version = "1.1.0", build = "34") =>
        writeFile(
          join(app, "Info.plist"),
          plist(
            field("CFBundleIdentifier", id) +
              field("CFBundleShortVersionString", version) +
              field("CFBundleVersion", build),
          ),
        );
      const expo = async (
        configured = "file:fingerprint",
        channel = "production",
      ) =>
        writeFile(
          join(app, "Expo.plist"),
          plist(
            field("EXUpdatesRuntimeVersion", configured) +
              `<key>EXUpdatesRequestHeaders</key><dict>${field("expo-channel-name", channel)}</dict>`,
          ),
        );
      await mkdir(join(app, "EXUpdates.bundle"));
      await info();
      await expo();
      await writeFile(join(app, "EXUpdates.bundle/fingerprint"), runtime);
      const run = () =>
        spawnSync(
          "bash",
          [
            resolve(
              import.meta.dirname,
              "../../.github/scripts/validate-ios-ipa.sh",
            ),
            app,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              IOS_IDENTIFIER: "app.test",
              APP_VERSION: "1.1.0",
              DISPOSABL_IOS_BUILD_NUMBER: "34",
              RUNTIME: runtime,
              CHANNEL: "production",
            },
          },
        );
      assert.equal(run().status, 0);
      for (const [label, mutate, restore] of [
        ["identifier", () => info("wrong"), () => info()],
        ["version", () => info("app.test", "1.0.0"), () => info()],
        ["build", () => info("app.test", "1.1.0", "33"), () => info()],
        [
          "runtime",
          () =>
            writeFile(
              join(app, "EXUpdates.bundle/fingerprint"),
              "b".repeat(40),
            ),
          () => writeFile(join(app, "EXUpdates.bundle/fingerprint"), runtime),
        ],
        ["channel", () => expo("file:fingerprint", "preview"), () => expo()],
      ] as const) {
        await mutate();
        const result = run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, new RegExp(`${label} mismatch`));
        await restore();
      }
      await rm(join(app, "EXUpdates.bundle/fingerprint"));
      assert.match(run().stderr, /fingerprint missing or unreadable/);
      await expo(runtime);
      assert.equal(run().status, 0);
      await expo("wrong");
      assert.match(run().stderr, /runtime mismatch/);
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  },
);
