import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function fingerprint(text) {
  const matches = [...text.matchAll(/SHA256:\s*([0-9A-F:]{95})/gi)];
  if (matches.length !== 1)
    throw new Error("Expected exactly one SHA256 certificate fingerprint");
  return matches[0][1].replaceAll(":", "").toUpperCase();
}

export function verifyNativeUpdates(manifest, { projectId, channel }) {
  const metadata = (name) => {
    const tags = [...manifest.matchAll(/<meta-data\b[^>]*\/?\s*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes(`android:name="${name}"`));
    if (tags.length !== 1) throw new Error(`Missing or duplicate ${name}`);
    return /\bandroid:value="([^"]*)"/
      .exec(tags[0])?.[1]
      ?.replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&");
  };
  const prefix = "expo.modules.updates.";
  if (
    metadata(prefix + "ENABLED") !== "true" ||
    metadata(prefix + "EXPO_UPDATE_URL") !==
      `https://u.expo.dev/${projectId}` ||
    metadata(prefix + "EXPO_RUNTIME_VERSION") !== "@string/expo_runtime_version"
  )
    throw new Error("Native update configuration mismatch");
  let headers;
  try {
    headers = JSON.parse(
      metadata(prefix + "UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY"),
    );
  } catch {
    throw new Error("Invalid native update headers");
  }
  if (
    JSON.stringify(headers) !== JSON.stringify({ "expo-channel-name": channel })
  )
    throw new Error("Native update channel mismatch");
}

export function verifyBundle({
  bundle,
  packageId,
  version,
  architectures,
  expectedCert,
  bundletool,
  production = false,
  updates,
  execute,
}) {
  const run =
    execute ??
    ((command, args) =>
      execFileSync(command, args, {
        encoding: "utf8",
        env: { ...process.env, LANG: "C", LC_ALL: "C" },
        maxBuffer: 8 * 1024 * 1024,
      }));
  const entries = run("unzip", ["-Z1", bundle]).split("\n");
  const actual = [
    ...new Set(
      entries
        .map((x) => /^base\/lib\/([^/]+)\/.+\.so$/.exec(x)?.[1])
        .filter(Boolean),
    ),
  ].sort();
  if (JSON.stringify(actual) !== JSON.stringify([...architectures].sort()))
    throw new Error(`Bundle ABI mismatch: ${actual.join(",")}`);
  run("java", ["-jar", bundletool, "validate", `--bundle=${bundle}`]);
  const manifest = run("java", [
    "-jar",
    bundletool,
    "dump",
    "manifest",
    `--bundle=${bundle}`,
  ]);
  if (production && manifest.includes("e2e_network_security_config"))
    throw new Error("Bundle contains E2E network configuration");
  if (updates) {
    verifyNativeUpdates(manifest, updates);
    const runtime = run("java", [
      "-jar",
      bundletool,
      "dump",
      "resources",
      `--bundle=${bundle}`,
      "--resource=string/expo_runtime_version",
      "--values",
    ]);
    if (!/\(default\) - \[STR\] "file:fingerprint"/.test(runtime))
      throw new Error("Native runtime must use the embedded fingerprint");
  }
  const targetSdk = Number(
    /\bandroid:targetSdkVersion="(\d+)"/.exec(manifest)?.[1],
  );
  if (production && (!Number.isInteger(targetSdk) || targetSdk < 36))
    throw new Error("Play requires Android target SDK 36 or higher");
  const manifestPackage = /\bpackage="([^"]+)"/.exec(manifest)?.[1];
  const manifestVersion = /\bandroid:versionCode="(\d+)"/.exec(manifest)?.[1];
  if (manifestPackage !== packageId || manifestVersion !== version)
    throw new Error("Bundle manifest package or version mismatch");
  const verified = run("jarsigner", ["-verify", bundle]);
  if (
    !verified.includes("jar verified.") ||
    verified.includes("unsigned entries")
  )
    throw new Error("Bundle signature verification failed");
  if (
    fingerprint(run("keytool", ["-printcert", "-jarfile", bundle])) !==
    expectedCert
  )
    throw new Error(
      "Bundle signer does not match expected signing certificate",
    );
  return {
    bundle,
    packageId,
    versionCode: Number(version),
    architectures: actual,
    uploadCertificateSha256: expectedCert,
    sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex"),
  };
}
