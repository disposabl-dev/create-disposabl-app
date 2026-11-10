import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function release(options: {
  prepared?: string;
  available?: string;
  failure?: boolean;
}) {
  const directory = mkdtempSync(join(tmpdir(), "package-release-"));
  try {
    const bin = join(directory, "bin");
    mkdirSync(bin);
    mkdirSync(join(directory, "packages/sdk"), { recursive: true });
    writeFileSync(
      join(directory, "packages/sdk/package.json"),
      JSON.stringify({ name: "@fixture/sdk", version: "1.0.0-development" }),
    );
    for (const file of ["release.sh", "release-source.sh"])
      copyFileSync(
        new URL(`../../.github/scripts/${file}`, import.meta.url),
        join(directory, file),
      );
    const executable = (name: string, body: string) =>
      writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, {
        mode: 0o755,
      });
    executable(
      "bun",
      `if [[ "$*" == 'run --cwd packages/sdk release' ]]; then
  echo release >> calls
  [[ "$FAIL_RELEASE" != true ]] || exit 1
  if [[ -n "$PREPARED" ]]; then
    printf '{"name":"@fixture/sdk","version":"%s"}' "$PREPARED" > packages/sdk/package.json
  fi
fi`,
    );
    executable(
      "npm",
      `echo "npm $*" >> calls
[[ -n "$AVAILABLE" ]] || { echo 'E404 or registry unavailable' >&2; exit 1; }
printf '%s\\n' "$AVAILABLE"`,
    );
    executable(
      "node",
      `if [[ "$1" == -p ]]; then
  if [[ "$2" == *.name ]]; then echo '@fixture/sdk';
  else sed -E 's/.*"version":"([^"]+)".*/\\1/' packages/sdk/package.json; fi
else
  printf '%s version=%s\\n' "$*" "$PUBLISHED_VERSION" >> calls
fi`,
    );
    const result = spawnSync("/bin/bash", ["release.sh", "package-release"], {
      cwd: directory,
      encoding: "utf8",
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        NODE_ENV: "test",
        PACKAGE: "sdk",
        PUBLISHED_VERSION: "",
        GH_TOKEN: "fixture-github-token",
        PREPARED: options.prepared ?? "",
        AVAILABLE: options.available ?? "",
        FAIL_RELEASE: String(options.failure ?? false),
      },
    });
    const calls = join(directory, "calls");
    assert.ok(
      existsSync(calls),
      result.stderr || "Release script did not start",
    );
    return { ...result, calls: readFileSync(calls, "utf8") };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("first publication runs before any registry lookup", () => {
  const result = release({ prepared: "1.0.0", available: "1.0.0" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.calls.indexOf("release\n") < result.calls.indexOf("npm view"),
  );
  assert.match(result.calls, /npm view @fixture\/sdk@1\.0\.0 version/);
  assert.match(result.calls, /report typescript-sdk ready version=1\.0\.0/);
});

test("no new release reports the existing public version", () => {
  const result = release({ available: "1.2.3" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /npm view @fixture\/sdk version/);
  assert.match(result.calls, /ready version=1\.2\.3/);
});

test("release authorization failure is a failed job, not a successful skip", () => {
  const result = release({ failure: true });
  assert.equal(result.status, 1);
  assert.match(result.calls, /report typescript-sdk failed/);
  assert.doesNotMatch(result.calls, /npm view| ready /);
});

test("unavailable registry or no public version cannot report ready", () => {
  for (const prepared of [undefined, "1.0.0"]) {
    const result = release({ prepared });
    assert.equal(result.status, 1);
    assert.match(result.calls, /release\n/);
    assert.match(result.calls, /availability could not be verified/);
    assert.doesNotMatch(result.calls, / ready /);
  }
});

test("a mismatched registry version cannot report ready", () => {
  const result = release({ prepared: "1.0.0", available: "0.9.0" });
  assert.equal(result.status, 1);
  assert.match(result.calls, /no matching published version/);
  assert.doesNotMatch(result.calls, / ready /);
});
