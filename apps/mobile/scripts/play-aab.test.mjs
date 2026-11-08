import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBundle } from "./verify-play-aab.mjs";

test("bundle verification rejects identity, ABI, signer and signature mismatches", () => {
  const dir = mkdtempSync(join(tmpdir(), "play-aab-test-"));
  const original = { ...process.env };
  try {
    const commands = {
      unzip: `printf 'base/lib/arm64-v8a/liba.so\\nbase/lib/x86_64/liba.so\\n'`,
      java: `if [ "$3" = dump ]; then printf '<manifest package="app.test" android:versionCode="4"><uses-sdk android:targetSdkVersion="36"/></manifest>'; fi`,
      jarsigner: `if [ "\${BAD_SIGNATURE:-}" = 1 ]; then printf 'jar is unsigned.'; else printf 'jar verified.'; fi`,
      keytool: `printf 'SHA256: ${Array(32).fill("AA").join(":")}\\n'`,
    };
    for (const [name, body] of Object.entries(commands)) {
      const path = join(dir, name);
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
    }
    process.env.PATH = `${dir}:${original.PATH}`;
    const bundle = join(dir, "app.aab");
    writeFileSync(bundle, "fixture");
    const args = {
      bundle,
      packageId: "app.test",
      version: "4",
      architectures: ["arm64-v8a", "x86_64"],
      expectedCert: "AA".repeat(32),
      bundletool: "bundletool.jar",
    };
    expect(verifyBundle({ ...args, production: true }).architectures).toEqual([
      "arm64-v8a",
      "x86_64",
    ]);
    expect(() => verifyBundle({ ...args, packageId: "app.other" })).toThrow(
      "manifest package or version",
    );
    expect(() => verifyBundle({ ...args, version: "5" })).toThrow(
      "manifest package or version",
    );
    expect(() =>
      verifyBundle({ ...args, architectures: ["arm64-v8a"] }),
    ).toThrow("ABI mismatch");
    expect(() =>
      verifyBundle({ ...args, expectedCert: "BB".repeat(32) }),
    ).toThrow("signer does not match");
    process.env.BAD_SIGNATURE = "1";
    expect(() => verifyBundle(args)).toThrow("signature verification failed");
  } finally {
    process.env.PATH = original.PATH;
    if (original.BAD_SIGNATURE === undefined) delete process.env.BAD_SIGNATURE;
    else process.env.BAD_SIGNATURE = original.BAD_SIGNATURE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Play build rejects stale version and E2E configuration before signing", () => {
  const script = fileURLToPath(new URL("./play-aab.mjs", import.meta.url));
  const env = {
    PATH: process.env.PATH,
    BUNDLETOOL_JAR: "unused.jar",
    PLAY_PACKAGE_ID: "app.test",
    PLAY_UPLOAD_CERT_SHA256: "AA".repeat(32),
    PLAY_PREVIOUS_VERSION_CODE: "4",
    DISPOSABL_ANDROID_VERSION_CODE: "4",
  };
  const stale = spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
  });
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toContain("greater than the verified Play version");
  const e2e = spawnSync(process.execPath, [script], {
    env: {
      ...env,
      DISPOSABL_ANDROID_VERSION_CODE: "5",
      ANDROID_KEYSTORE_PATH: "unused",
      ANDROID_KEYSTORE_PASSWORD: "unused",
      ANDROID_KEY_ALIAS: "unused",
      ANDROID_KEY_PASSWORD: "unused",
      EXPO_PUBLIC_E2E: "true",
    },
    encoding: "utf8",
  });
  expect(e2e.status).not.toBe(0);
  expect(e2e.stderr).toContain("E2E builds cannot be uploaded");
});
