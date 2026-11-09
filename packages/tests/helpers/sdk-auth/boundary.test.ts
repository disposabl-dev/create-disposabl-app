import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { reserveSdkArtifacts } from "./artifacts";
import { assertOwnedSdkBackend } from "./ownership";

test("SDK artifacts require an explicit unused temporary directory", () => {
  const parent = mkdtempSync("/tmp/sdk-artifacts-boundary-");
  assert.throws(() => reserveSdkArtifacts(""), /unused absolute/);
  assert.throws(() => reserveSdkArtifacts("relative"), /unused absolute/);
  assert.throws(
    () => reserveSdkArtifacts("/tmp/../sdk-outside"),
    /under \/tmp/,
  );
  symlinkSync("/", join(parent, "escape"));
  assert.throws(
    () => reserveSdkArtifacts(join(parent, "escape/sdk-outside")),
    /under \/tmp/,
  );
  const output = reserveSdkArtifacts(join(parent, "evidence"));
  assert.equal(output, join(realpathSync(parent), "evidence"));
  writeFileSync(join(output, "retained.txt"), "fixture evidence");
  assert.throws(() => reserveSdkArtifacts(output), /EEXIST/);
});

test("SDK ownership rejects absent, exposed, symlinked and unrelated markers", () => {
  const original = process.env.E2E_SDK_OWNERSHIP_FILE;
  const parent = mkdtempSync("/tmp/sdk-ownership-boundary-");
  const marker = join(parent, "ownership.json");
  try {
    delete process.env.E2E_SDK_OWNERSHIP_FILE;
    assert.throws(assertOwnedSdkBackend, /own fresh backend/);
    writeFileSync(
      marker,
      JSON.stringify({
        version: 1,
        launcherPid: process.pid,
        backendPid: process.pid,
        database: join(parent, "absent.sqlite3"),
      }),
      { mode: 0o644 },
    );
    process.env.E2E_SDK_OWNERSHIP_FILE = marker;
    assert.throws(assertOwnedSdkBackend, /own fresh backend/);
    chmodSync(marker, 0o600);
    // The test process cannot impersonate a backend child of its own launcher.
    assert.throws(assertOwnedSdkBackend, /own fresh backend/);
    const alias = join(parent, "alias.json");
    symlinkSync(marker, alias);
    process.env.E2E_SDK_OWNERSHIP_FILE = alias;
    assert.throws(assertOwnedSdkBackend, /own fresh backend/);
  } finally {
    if (original === undefined) delete process.env.E2E_SDK_OWNERSHIP_FILE;
    else process.env.E2E_SDK_OWNERSHIP_FILE = original;
  }
});

test("auth erasure requires its own ownership marker", () => {
  const saved = process.env.LOCAL_AUTH_OWNERSHIP_FILE;
  try {
    delete process.env.LOCAL_AUTH_OWNERSHIP_FILE;
    assert.throws(
      () =>
        assertOwnedSdkBackend({
          markerVariable: "LOCAL_AUTH_OWNERSHIP_FILE",
          ports: [3490, 3491],
          claimDirectory: ".auth-erasure-claimed",
        }),
      /own fresh backend/,
    );
  } finally {
    if (saved === undefined) delete process.env.LOCAL_AUTH_OWNERSHIP_FILE;
    else process.env.LOCAL_AUTH_OWNERSHIP_FILE = saved;
  }
});
