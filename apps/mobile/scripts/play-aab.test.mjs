import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
  copyFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBundle } from "./verify-play-aab.mjs";
import { freshAndroid } from "./fresh-android.mjs";

test("Play preflight rejects tools and keys moved by native regeneration", () => {
  const mobile = mkdtempSync(join(tmpdir(), "play-input-paths-"));
  try {
    mkdirSync(join(mobile, "scripts"));
    mkdirSync(join(mobile, "android"));
    for (const file of [
      "play-aab.mjs",
      "verify-play-aab.mjs",
      "fresh-android.mjs",
    ])
      copyFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        join(mobile, "scripts", file),
      );
    const inside = join(mobile, "android/input");
    const outside = join(mobile, "input");
    const alias = join(mobile, "outside-link");
    writeFileSync(inside, "fixture");
    writeFileSync(outside, "fixture");
    symlinkSync(inside, alias);
    const env = {
      PATH: process.env.PATH,
      PLAY_PACKAGE_ID: "app.test",
      PLAY_UPLOAD_CERT_SHA256: "AA".repeat(32),
      PLAY_PREVIOUS_VERSION_CODE: "4",
      DISPOSABL_ANDROID_VERSION_CODE: "5",
      EXPO_PUBLIC_CONVEX_URL: "https://backend.example.test",
      EXPO_PUBLIC_CONVEX_SITE_URL: "https://site.example.test",
      ANDROID_KEYSTORE_PATH: outside,
      ANDROID_KEYSTORE_PASSWORD: "fixture",
      ANDROID_KEY_ALIAS: "fixture",
      ANDROID_KEY_PASSWORD: "fixture",
      BUNDLETOOL_JAR: outside,
    };
    for (const key of ["BUNDLETOOL_JAR", "ANDROID_KEYSTORE_PATH"])
      for (const path of [inside, alias]) {
        const result = spawnSync(
          process.execPath,
          [join(mobile, "scripts/play-aab.mjs")],
          {
            env: { ...env, [key]: path },
            encoding: "utf8",
          },
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          `Keep ${key} outside the generated Android project`,
        );
        expect(readFileSync(inside, "utf8")).toBe("fixture");
      }
  } finally {
    rmSync(mobile, { recursive: true, force: true });
  }
});

test("Play prebuild replaces stale native settings and preserves the prior project", () => {
  const mobile = mkdtempSync(join(tmpdir(), "play-prebuild-test-"));
  const android = join(mobile, "android");
  mkdirSync(join(android, "app"), { recursive: true });
  writeFileSync(join(android, "app/build.gradle"), "same package and version");
  writeFileSync(
    join(android, "old-native-settings"),
    "E2E client and old OTA channel",
  );
  let saved;
  try {
    saved = freshAndroid(mobile, () => {
      expect(existsSync(android)).toBe(false);
      mkdirSync(join(android, "app"), { recursive: true });
      writeFileSync(join(android, "app/build.gradle"), "fresh production");
    });
    expect(existsSync(join(android, "old-native-settings"))).toBe(false);
    expect(
      readFileSync(join(saved, "android/old-native-settings"), "utf8"),
    ).toBe("E2E client and old OTA channel");
    expect(readFileSync(join(android, "app/build.gradle"), "utf8")).toBe(
      "fresh production",
    );
  } finally {
    rmSync(mobile, { recursive: true, force: true });
    if (saved) rmSync(saved, { recursive: true, force: true });
  }
});

test("failed Play prebuild restores the previous native project", () => {
  const mobile = mkdtempSync(join(tmpdir(), "play-prebuild-failure-"));
  const android = join(mobile, "android");
  mkdirSync(android);
  writeFileSync(join(android, "original"), "preserve");
  try {
    expect(() =>
      freshAndroid(mobile, () => {
        expect(existsSync(android)).toBe(false);
        mkdirSync(android);
        writeFileSync(join(android, "partial"), "incomplete generation");
        throw new Error("prebuild failed");
      }),
    ).toThrow("prebuild failed");
    expect(readFileSync(join(android, "original"), "utf8")).toBe("preserve");
    expect(existsSync(join(android, "partial"))).toBe(false);
  } finally {
    rmSync(mobile, { recursive: true, force: true });
  }
});

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
