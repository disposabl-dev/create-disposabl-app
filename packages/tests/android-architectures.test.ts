import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateAndroidArchitectures } from "../disposabl-kit/android-architectures";

test("Android architectures validate and preserve a stable supported selection", () => {
  assert.deepEqual(validateAndroidArchitectures(), ["arm64-v8a", "x86_64"]);
  assert.deepEqual(validateAndroidArchitectures(["x86_64", "arm64-v8a"]), [
    "arm64-v8a",
    "x86_64",
  ]);
  for (const invalid of [[], ["arm64-v8a", "arm64-v8a"], ["mips"], null])
    assert.throws(() => validateAndroidArchitectures(invalid));
});

test("APK inspection accepts exactly the selected native architectures", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-abi-apk-"));
  for (const abi of ["arm64-v8a", "x86_64"]) {
    mkdirSync(join(dir, "lib", abi), { recursive: true });
    writeFileSync(join(dir, "lib", abi, "libexample.so"), "fixture");
  }
  execFileSync("zip", ["-qr", "fixture.apk", "lib"], { cwd: dir });
  const script = resolve(
    import.meta.dirname,
    "../../.github/scripts/verify-android-abis.mjs",
  );
  for (const [selected, success] of [
    [["arm64-v8a", "x86_64"], true],
    [["arm64-v8a"], false],
    [["arm64-v8a", "x86_64", "x86"], false],
    [[], false],
  ] as const) {
    const result = spawnSync(process.execPath, [
      script,
      join(dir, "fixture.apk"),
      JSON.stringify({ androidArchitectures: selected }),
    ]);
    assert.equal(result.status === 0, success);
  }
});
