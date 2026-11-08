import { execFileSync } from "node:child_process";

const [apk, manifest] = process.argv.slice(2);
const expected = JSON.parse(manifest).androidArchitectures;
const entries = execFileSync("unzip", ["-Z1", apk], { encoding: "utf8" }).split(
  "\n",
);
const actual = [
  ...new Set(
    entries
      .map((path) => /^lib\/([^/]+)\/.+\.so$/.exec(path)?.[1])
      .filter(Boolean),
  ),
].sort();
if (
  !Array.isArray(expected) ||
  !expected.length ||
  JSON.stringify(actual) !== JSON.stringify([...expected].sort())
)
  throw new Error(
    `APK architectures mismatch: expected ${expected?.join(",")}; found ${actual.join(",")}`,
  );
