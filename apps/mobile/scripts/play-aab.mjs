import { execFileSync } from "node:child_process";
import { accessSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, verifyBundle } from "./verify-play-aab.mjs";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
function required(name) {
  if (!env[name]) throw new Error(`Missing ${name}`);
  return env[name];
}
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: mobile,
    encoding: "utf8",
    ...options,
  });
}
const packageId = required("PLAY_PACKAGE_ID");
if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageId))
  throw new Error("Invalid Play package ID");
const expectedCert = required("PLAY_UPLOAD_CERT_SHA256")
  .replaceAll(":", "")
  .toUpperCase();
if (!/^[0-9A-F]{64}$/.test(expectedCert))
  throw new Error("Invalid upload certificate SHA256");
const version = required("DISPOSABL_ANDROID_VERSION_CODE");
const previous = required("PLAY_PREVIOUS_VERSION_CODE");
if (
  !/^[1-9]\d*$/.test(version) ||
  !/^(0|[1-9]\d*)$/.test(previous) ||
  Number(version) > 2100000000 ||
  BigInt(version) <= BigInt(previous)
)
  throw new Error(
    "Version code must be greater than the verified Play version code",
  );
for (const key of [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
])
  required(key);
if (env.EXPO_PUBLIC_E2E === "true")
  throw new Error("E2E builds cannot be uploaded to Play");
for (const key of ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CONVEX_SITE_URL"]) {
  const url = new URL(required(key));
  if (
    url.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname)
  )
    throw new Error(`${key} must be a non-loopback HTTPS URL`);
}
accessSync(required("BUNDLETOOL_JAR"));
env.DISPOSABL_MOBILE_CHANNEL = "production";
env.DISPOSABL_ANDROID_CHANNEL = "production";
env.EXPO_NO_DOTENV = "1";
const keyInfo = run(
  "keytool",
  [
    "-list",
    "-v",
    "-keystore",
    env.ANDROID_KEYSTORE_PATH,
    "-storepass:env",
    "ANDROID_KEYSTORE_PASSWORD",
    "-alias",
    env.ANDROID_KEY_ALIAS,
  ],
  { env: { ...env, LANG: "C", LC_ALL: "C" } },
);
if (fingerprint(keyInfo) !== expectedCert)
  throw new Error(
    "Keystore certificate does not match verified Play upload certificate",
  );
const config = JSON.parse(
  run("bun", ["x", "--no-install", "expo", "config", "--json"]),
);
if (
  config.android?.package !== packageId ||
  String(config.android?.versionCode) !== version
)
  throw new Error(
    "Expo package or version does not match verified Play identity",
  );
const gradle = readFileSync(join(mobile, "android/app/build.gradle"), "utf8");
if (
  !gradle.includes(`applicationId '${packageId}'`) ||
  !gradle.includes(`versionCode ${version}\n`)
)
  throw new Error(
    "Generated Android project does not match Expo package and version; generate a fresh native project before building",
  );
const architectures = config.extra?.disposablAndroidArchitectures;
if (
  !Array.isArray(architectures) ||
  !architectures.length ||
  architectures.some(
    (x) => !["arm64-v8a", "x86_64", "armeabi-v7a", "x86"].includes(x),
  ) ||
  new Set(architectures).size !== architectures.length
)
  throw new Error("Invalid configured Android architectures");
run(
  "./gradlew",
  [
    ":app:createBundleReleaseJsAndAssets",
    "--rerun",
    ":app:bundleRelease",
    `-PreactNativeArchitectures=${architectures.join(",")}`,
  ],
  { cwd: join(mobile, "android"), stdio: "inherit" },
);
const bundle = join(
  mobile,
  "android/app/build/outputs/bundle/release/app-release.aab",
);
const bundledConfig = JSON.parse(
  run("unzip", ["-p", bundle, "base/assets/app.config"]),
);
for (const [label, built, expected] of [
  ["package", bundledConfig.android?.package, config.android?.package],
  ["scheme", bundledConfig.scheme, config.scheme],
  ["updates", bundledConfig.updates?.enabled, config.updates?.enabled],
  [
    "payments",
    bundledConfig.extra?.disposablAndroidPayments,
    config.extra?.disposablAndroidPayments,
  ],
  [
    "architectures",
    bundledConfig.extra?.disposablAndroidArchitectures,
    architectures,
  ],
]) {
  if (JSON.stringify(built) !== JSON.stringify(expected))
    throw new Error(`Bundled Expo ${label} does not match production config`);
}
const verified = verifyBundle({
  bundle,
  packageId,
  version,
  architectures,
  expectedCert,
  bundletool: required("BUNDLETOOL_JAR"),
  production: true,
});
console.log(JSON.stringify(verified, null, 2));
