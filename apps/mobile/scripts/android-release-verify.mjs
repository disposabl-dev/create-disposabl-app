import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { verifyBundle } from "./verify-play-aab.mjs";

export function verifyInputs(config, manifest, env) {
  if (config.android?.package !== manifest.applicationId)
    throw new Error("Expo package does not match release manifest");
  const version = String(env.DISPOSABL_ANDROID_VERSION_CODE || "1");
  if (
    !/^[1-9]\d*$/.test(version) ||
    BigInt(version) > 2100000000n ||
    String(config.android?.versionCode) !== version
  )
    throw new Error("Expo Android version does not match the release version");
  const abis = config.extra?.disposablAndroidArchitectures;
  if (
    !Array.isArray(abis) ||
    !abis.length ||
    new Set(abis).size !== abis.length ||
    abis.some(
      (abi) => !["arm64-v8a", "x86_64", "armeabi-v7a", "x86"].includes(abi),
    ) ||
    JSON.stringify(abis) !== JSON.stringify(manifest.androidArchitectures)
  )
    throw new Error("Invalid Android architectures");
  if (env.CHANNEL === "production") {
    if (env.GH_REPO === "disposabl-dev/create-disposabl-app") {
      if (
        config.android?.package !== "com.yastai.disposabl" ||
        config.extra?.disposablAndroidPayments !== false ||
        JSON.stringify(abis) !== JSON.stringify(["arm64-v8a", "x86_64"]) ||
        env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED !== "true" ||
        env.UPDATE_POLICY !== "disabled" ||
        config.updates?.requestHeaders != null
      )
        throw new Error("Disposabl production configuration policy mismatch");
      // Shared builds retain the Expo identity for runtime fingerprinting.
      // That identity never enables OTA: URL, headers and enabled are checked.
      if (config.extra?.eas?.projectId !== manifest.projectId)
        throw new Error("Disposabl Expo project identity mismatch");
    }
    if (env.EXPO_PUBLIC_E2E === "true")
      throw new Error("E2E is not permitted in production");
    for (const key of [
      "EXPO_PUBLIC_CONVEX_URL",
      "EXPO_PUBLIC_CONVEX_SITE_URL",
    ]) {
      const url = new URL(env[key]);
      if (
        url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname)
      )
        throw new Error(`${key} must be a non-loopback HTTPS URL`);
    }
    if (
      env.UPDATE_POLICY === "disabled" &&
      (config.updates?.enabled !== false || config.updates?.url)
    )
      throw new Error("Production updates must be disabled");
  }
}

export function verifyEmbedded(config, embedded) {
  for (const [name, actual, expected] of [
    ["package", embedded.android?.package, config.android?.package],
    ["version", embedded.android?.versionCode, config.android?.versionCode],
    ["scheme", embedded.scheme, config.scheme],
    ["updates", embedded.updates?.enabled, config.updates?.enabled],
    [
      "payments",
      embedded.extra?.disposablAndroidPayments,
      config.extra?.disposablAndroidPayments,
    ],
    [
      "architectures",
      embedded.extra?.disposablAndroidArchitectures,
      config.extra?.disposablAndroidArchitectures,
    ],
  ])
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Bundled Expo ${name} does not match build config`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [operation, configPath, manifestText, artifact, cert] =
    process.argv.slice(2);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const manifest = JSON.parse(manifestText);
  verifyInputs(config, manifest, process.env);
  if (operation === "artifact") {
    const entry = artifact.endsWith(".aab")
      ? "base/assets/app.config"
      : "assets/app.config";
    const embedded = JSON.parse(
      execFileSync("unzip", ["-p", artifact, entry], { encoding: "utf8" }),
    );
    verifyEmbedded(config, embedded);
    if (artifact.endsWith(".aab")) {
      if (!process.env.BUNDLETOOL_JAR)
        throw new Error("Bundletool is required for AAB validation");
      verifyBundle({
        bundle: artifact,
        packageId: manifest.applicationId,
        version: String(config.android.versionCode),
        architectures: manifest.androidArchitectures,
        expectedCert: cert.toUpperCase(),
        bundletool: process.env.BUNDLETOOL_JAR,
        production: process.env.CHANNEL === "production",
      });
    }
  } else if (operation !== "inputs")
    throw new Error("Expected inputs or artifact");
}
