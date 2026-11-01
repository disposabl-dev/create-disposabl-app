import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: mobileRoot,
    env: process.env,
    stdio: "inherit",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args[0]} failed (${result.status})`);
  return result.stdout?.trim();
}

export function runtimeVersion() {
  const result = JSON.parse(
    run(
      "bun",
      [
        "x",
        "--no-install",
        "expo-updates",
        "runtimeversion:resolve",
        "--platform",
        "android",
        "--workflow",
        "managed",
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    ),
  );
  if (
    !result.fingerprintSources ||
    !/^[a-f0-9]{40,64}$/.test(result.runtimeVersion)
  ) {
    throw new Error(
      "Android requires an Expo project and runtimeVersion.policy=fingerprint",
    );
  }
  return result.runtimeVersion;
}

export function buildAndroid(expectedRuntime = runtimeVersion()) {
  const production =
    (process.env.DISPOSABL_MOBILE_CHANNEL ||
      process.env.DISPOSABL_ANDROID_CHANNEL) === "production";
  let credentials;
  try {
    if (production) {
      for (const key of [
        "ANDROID_KEYSTORE_BASE64",
        "ANDROID_KEYSTORE_PASSWORD",
        "ANDROID_KEY_ALIAS",
        "ANDROID_KEY_PASSWORD",
      ]) {
        if (!process.env[key])
          throw new Error(`Production Android signing requires ${key}`);
      }
      credentials = mkdtempSync(join(tmpdir(), "disposabl-signing-"));
      process.env.ANDROID_KEYSTORE_PATH = join(credentials, "release.jks");
      writeFileSync(
        process.env.ANDROID_KEYSTORE_PATH,
        Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, "base64"),
        { mode: 0o600 },
      );
    }
    run("bun", [
      "x",
      "--no-install",
      "expo",
      "prebuild",
      "--platform",
      "android",
      "--no-install",
    ]);
    if (runtimeVersion() !== expectedRuntime) {
      throw new Error(
        "Expo prebuild changed fingerprint inputs; commit its package.json changes before building again",
      );
    }
    const args = [":app:assembleRelease", "--no-daemon"];
    if (process.env.DISPOSABL_ANDROID_ARCHITECTURES)
      args.push(
        `-PreactNativeArchitectures=${process.env.DISPOSABL_ANDROID_ARCHITECTURES}`,
      );
    run("./gradlew", args, { cwd: join(mobileRoot, "android") });
    const apk = join(
      mobileRoot,
      "android/app/build/outputs/apk/release/app-release.apk",
    );
    // Verify the runtime actually shipped in the APK, not only the pre-build calculation.
    const embedded = run("unzip", ["-p", apk, "assets/fingerprint"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (embedded !== expectedRuntime)
      throw new Error("Built APK fingerprint differs from the planned runtime");
    if (runtimeVersion() !== expectedRuntime)
      throw new Error("Android inputs changed during the build");
    const out = join(mobileRoot, "dist/android");
    mkdirSync(out, { recursive: true });
    copyFileSync(apk, join(out, "app.apk"));
    writeFileSync(
      join(out, "fingerprint.json"),
      JSON.stringify({ runtimeVersion: expectedRuntime }) + "\n",
    );
    return join(out, "app.apk");
  } finally {
    if (credentials) rmSync(credentials, { recursive: true, force: true });
    delete process.env.ANDROID_KEYSTORE_PATH;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  buildAndroid();
}
