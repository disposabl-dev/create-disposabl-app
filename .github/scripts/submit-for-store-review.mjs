import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [platform, version, build] = process.argv.slice(2);
if (!platform || platform === "--help") {
  console.log(
    "Submit for Store Review\n\n  bun run store:review ios <version> <build-number>\n  bun run store:review android",
  );
  console.log(
    "\nUse the version and build number from the GitHub Actions TestFlight upload.",
  );
  console.log(
    "Set ASC_APP_ID, ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_FILE locally.",
  );
  console.log(
    "For Android, use the uploaded Play draft's version code in .disposabl/store/release.json and configure the local Play credentials.",
  );
  process.exit(0);
}
if (platform === "android" && !version) {
  await import("./store-review.mjs");
  process.exit(0);
}
if (
  platform !== "ios" ||
  !/^\d+(\.\d+){0,2}$/.test(version) ||
  !/^\d+(\.\d+){0,2}$/.test(build)
)
  throw new Error("Use bun run store:review ios <version> <build-number>.");

const { ASC_APP_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_FILE } =
  process.env;
if (
  !/^\d+$/.test(ASC_APP_ID) ||
  !ASC_KEY_ID ||
  !ASC_ISSUER_ID ||
  !ASC_PRIVATE_KEY_FILE
)
  throw new Error(
    "Set the local App Store Connect app ID, key ID, issuer ID and key file.",
  );
let privateKey;
try {
  privateKey = readFileSync(ASC_PRIVATE_KEY_FILE, "utf8");
} catch {
  throw new Error("The local App Store Connect key file could not be read.");
}
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./apple-review.mjs", import.meta.url))],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ASC_PRIVATE_KEY: privateKey,
      ASC_EXPECTED_BUNDLE_ID: JSON.parse(
        readFileSync(
          new URL("../../apps/mobile/app.json", import.meta.url),
          "utf8",
        ),
      ).expo.ios.bundleIdentifier,
      APP_VERSION: version,
      BUILD_NUMBER: build,
      ASC_OPERATION: "review",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
