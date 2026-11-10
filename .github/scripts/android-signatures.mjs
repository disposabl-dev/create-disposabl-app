import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function verifySignature(file, expected, run = execute) {
  let certificates;
  if (file.endsWith(".apk")) {
    const output = run("apksigner", ["verify", "--print-certs", file]);
    certificates = [
      ...output.matchAll(
        /^(?:Signer #\d+|V[1-4] Signer:) certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$/gm,
      ),
    ].map((m) => m[1].toLowerCase());
  } else if (file.endsWith(".aab")) {
    const output = run("jarsigner", ["-verify", file]);
    if (
      !output.includes("jar verified.") ||
      output.includes("unsigned entries")
    )
      throw new Error("Bundle signature verification failed");
    const info = run("keytool", ["-printcert", "-jarfile", file]);
    certificates = [
      ...info.matchAll(
        /^\s*SHA256: ((?:[a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2})\s*$/gm,
      ),
    ].map((m) => m[1].replaceAll(":", "").toLowerCase());
  } else throw new Error("Expected an APK or AAB");
  if (
    certificates.length !== 1 ||
    (expected !== "fallback" && certificates[0] !== expected)
  )
    throw new Error(
      "Artifact signer does not match the selected signing identity",
    );
  return certificates[0];
}

function execute(command, args) {
  if (command === "apksigner") {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk)
      throw new Error("Android SDK is required for signature verification");
    const directory = join(sdk, "build-tools");
    const versions = readdirSync(directory)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    if (!versions.length) throw new Error("Android build-tools are missing");
    command = join(directory, versions[0], "apksigner");
  }
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(verifySignature(process.argv[2], process.argv[3]));
