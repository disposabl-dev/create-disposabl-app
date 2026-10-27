import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball) throw new Error("Usage: bun cli/smoke.ts <npm-tarball>");
const temp = await mkdtemp(join(tmpdir(), "create-disposabl-app-smoke-"));
try {
  // Install the actual package artifact. There are no runtime dependencies.
  execFileSync(
    "npm",
    [
      "install",
      resolve(tarball),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: temp, stdio: "pipe" },
  );
  const packageDir = join(temp, "node_modules/create-disposabl-app");
  const { version } = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  );
  const bin = join(packageDir, "dist/index.js");
  const node = execFileSync("node", ["-p", "process.execPath"], {
    encoding: "utf8",
  }).trim();

  for (const flag of ["-h", "--help"]) {
    const output = execFileSync(node, [bin, flag], {
      encoding: "utf8",
      env: { ...process.env, PATH: "" },
    });
    assert.match(output, /Usage: create-disposabl-app <appname>/);
  }
  for (const flag of ["-v", "--version"]) {
    assert.equal(
      execFileSync(node, [bin, flag], { encoding: "utf8" }).trim(),
      version,
    );
  }
  for (const flag of ["-h", "--help", "-v", "--version"]) {
    const output = execFileSync(
      "npx",
      ["--offline", "--yes=false", "create-disposabl-app", flag],
      { cwd: temp, encoding: "utf8", timeout: 10_000 },
    );
    if (flag === "-v" || flag === "--version") {
      assert.equal(output.trim(), version);
    } else assert.match(output, /Usage: create-disposabl-app <appname>/);
  }
  for (const args of [[], ["--unknown"], ["first", "second"]]) {
    assert.notEqual(spawnSync(node, [bin, ...args]).status, 0);
  }
  const missingBun = spawnSync(node, [bin, "missing-bun"], {
    cwd: temp,
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });
  assert.notEqual(missingBun.status, 0);
  assert.match(missingBun.stderr, /Install Bun/);
  await assert.rejects(access(join(temp, "missing-bun")));

  // The compiled CLI also works under Bun without Node on PATH.
  execFileSync(process.execPath, [bin, "bun-app", "--skip-install"], {
    cwd: temp,
    stdio: "pipe",
    env: { ...process.env, PATH: "" },
  });
  await access(join(temp, "bun-app/index.ts"));

  // Exercise npx's installed binary resolution and the default bun install.
  execFileSync(
    "npx",
    ["--offline", "--yes=false", "create-disposabl-app", "packed-app"],
    { cwd: temp, stdio: "pipe", timeout: 30_000 },
  );
  const app = join(temp, "packed-app");
  const files = (await readdir(app)).filter(
    (file) => !["node_modules", "bun.lock", "bun.lockb"].includes(file),
  );
  assert.deepEqual(files.sort(), [
    ".gitignore",
    "README.md",
    "index.ts",
    "package.json",
  ]);
  const manifest = JSON.parse(
    await readFile(join(app, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "packed-app");
  assert.equal(manifest.private, true);

  const dev = Bun.spawn([process.execPath, "run", "dev"], {
    cwd: app,
    env: { ...process.env, PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => dev.kill(), 10_000);
  try {
    const { value } = await dev.stdout.getReader().read();
    const log = new TextDecoder().decode(value);
    const url = log.match(/http:\/\/\S+/)?.[0];
    assert.ok(url, `Dev server did not start: ${log}`);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Your Disposabl app is ready.\n");
  } finally {
    clearTimeout(timeout);
    dev.kill();
    await dev.exited;
  }
  console.log(
    `Packed CLI ${version} passed: flags, npx, install, files, HTTP 200.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
