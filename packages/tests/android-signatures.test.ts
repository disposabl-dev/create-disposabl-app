import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Import the executable helper without adding JavaScript files to the tests
// workspace's TypeScript compilation scope.
const { verifySignature } = (await import(
  pathToFileURL(
    resolve(
      import.meta.dirname,
      "../../.github/scripts/android-signatures.mjs",
    ),
  ).href
)) as {
  verifySignature: (
    file: string,
    expected: string,
    run: (command: string, args: string[]) => string,
  ) => string;
};

const cert = "ab".repeat(32);
test("APK verifier requires exactly one verified signer and checks the selected identity", () => {
  const valid = () => `Signer #1 certificate SHA-256 digest: ${cert}\n`;
  assert.equal(verifySignature("fixture.apk", "fallback", valid), cert);
  assert.equal(verifySignature("fixture.apk", cert, valid), cert);
  assert.equal(
    verifySignature(
      "fixture.apk",
      cert,
      () => `V2 Signer: certificate SHA-256 digest: ${cert}\n`,
    ),
    cert,
  );
  assert.throws(
    () => verifySignature("fixture.apk", "00".repeat(32), valid),
    /signer/,
  );
  assert.throws(() => verifySignature("fixture.apk", cert, () => ""), /signer/);
  assert.throws(
    () => verifySignature("fixture.apk", cert, () => valid() + valid()),
    /signer/,
  );
  assert.throws(
    () =>
      verifySignature("fixture.apk", cert, () => {
        throw new Error("invalid signature");
      }),
    /invalid signature/,
  );
});

test("bundle verification rejects unsigned entries and certificate mismatches", () => {
  const run = (command: string) =>
    command === "jarsigner"
      ? "jar verified."
      : `SHA256: ${cert.match(/../g)!.join(":")}\n`;
  assert.equal(verifySignature("fixture.aab", cert, run), cert);
  assert.throws(
    () =>
      verifySignature(
        "fixture.aab",
        cert,
        () => "jar verified. contains unsigned entries",
      ),
    /signature/,
  );
  assert.throws(
    () => verifySignature("fixture.aab", "00".repeat(32), run),
    /signer/,
  );
});
