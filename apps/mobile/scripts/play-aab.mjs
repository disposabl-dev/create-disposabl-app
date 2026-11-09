import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, verifyBundle } from "./verify-play-aab.mjs";
import { freshAndroid } from "./fresh-android.mjs";

const mobile = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
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
const rawPlayCert = env.PLAY_UPLOAD_CERT_SHA256 || "";
const playCert = rawPlayCert.replaceAll(":", "").toUpperCase();
if (
  rawPlayCert &&
  !/^(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){31})$/.test(
    rawPlayCert,
  )
)
  throw new Error("Invalid upload certificate SHA256");
const rawPlayCertSha1 = env.PLAY_UPLOAD_CERT_SHA1 || "";
if (
  rawPlayCertSha1 &&
  !/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){19})$/.test(
    rawPlayCertSha1,
  )
)
  throw new Error("Invalid upload certificate SHA1");
const playCertSha1 = rawPlayCertSha1.replaceAll(":", "").toUpperCase();
const version = required("DISPOSABL_ANDROID_VERSION_CODE");
const previous = env.PLAY_PREVIOUS_VERSION_CODE || "";
if (!/^[1-9]\d*$/.test(version) || BigInt(version) > 2100000000n)
  throw new Error("Invalid candidate version code");
if (previous && !/^(0|[1-9]\d*)$/.test(previous))
  throw new Error("Invalid previous Play version code");
if (previous && BigInt(version) <= BigInt(previous))
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
env.BUNDLETOOL_JAR = realpathSync(required("BUNDLETOOL_JAR"));
env.ANDROID_KEYSTORE_PATH = realpathSync(env.ANDROID_KEYSTORE_PATH);
for (const key of ["BUNDLETOOL_JAR", "ANDROID_KEYSTORE_PATH"])
  if (env[key].startsWith(`${mobile}${sep}android${sep}`))
    throw new Error(`Keep ${key} outside the generated Android project`);
env.DISPOSABL_MOBILE_CHANNEL = "production";
env.DISPOSABL_ANDROID_CHANNEL = "production";
env.EXPO_NO_DOTENV = "1";
env.EXPO_NO_TELEMETRY = "1";
env.DO_NOT_TRACK = "1";
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
const signingCert = fingerprint(keyInfo);
if (playCertSha1) {
  const values = [
    ...keyInfo.matchAll(
      /^\s*SHA1:\s*((?:[0-9a-fA-F]{2}:){19}[0-9a-fA-F]{2})\s*$/gm,
    ),
  ];
  if (values.length !== 1)
    throw new Error("Expected exactly one SHA1 certificate fingerprint");
  if (values[0][1].replaceAll(":", "").toUpperCase() !== playCertSha1)
    throw new Error(
      "Keystore certificate SHA1 does not match supplied Play upload certificate",
    );
}
if (playCert && signingCert !== playCert)
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
    "Expo package or candidate version does not match requested inputs",
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
freshAndroid(mobile, () =>
  run(
    "bun",
    [
      "x",
      "--no-install",
      "expo",
      "prebuild",
      "--platform",
      "android",
      "--no-install",
    ],
    {
      stdio: "inherit",
    },
  ),
);
const gradle = readFileSync(join(mobile, "android/app/build.gradle"), "utf8");
if (
  !gradle.includes(`applicationId '${packageId}'`) ||
  !gradle.includes(`versionCode ${version}\n`)
)
  throw new Error(
    "Fresh Android project does not match requested package and candidate version",
  );
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
  expectedCert: signingCert,
  bundletool: required("BUNDLETOOL_JAR"),
  production: true,
});
const { uploadCertificateSha256: _certificate, ...bundleResult } = verified;
console.log(
  JSON.stringify(
    {
      ...bundleResult,
      signingCertificateSha256: signingCert,
      signingCertificateSource: "selected keystore",
      playUploadCertificate: playCert
        ? "matched supplied fingerprint"
        : "unchecked",
      playUploadCertificateSha1: playCertSha1
        ? "matched supplied fingerprint"
        : "unchecked",
      playPreviousVersion: previous
        ? "checked against supplied version"
        : "unchecked",
    },
    null,
    2,
  ),
);
