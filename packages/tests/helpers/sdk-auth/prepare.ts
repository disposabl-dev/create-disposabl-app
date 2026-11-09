import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../../project";
import { reserveSdkArtifacts } from "./artifacts";

/** Builds and imports the tarball through its package export, without registry access. */
export async function packagedSdk() {
  const stage = reserveSdkArtifacts();
  writeFileSync(
    join(stage, "status.json"),
    JSON.stringify({ status: "preparing" }),
  );
  try {
    const pkg = join(stage, "packages/sdk");
    mkdirSync(join(stage, "packages/backend/generated"), { recursive: true });
    mkdirSync(join(stage, "packages/disposabl-kit/server/release"), {
      recursive: true,
    });
    cpSync(join(root, "packages/sdk"), pkg, {
      recursive: true,
      filter: (path) => !/\/(node_modules|dist)(\/|$)/.test(path),
    });
    symlinkSync(join(root, "node_modules"), join(stage, "node_modules"), "dir");
    symlinkSync(
      join(root, "packages/backend/generated/openapi.json"),
      join(stage, "packages/backend/generated/openapi.json"),
    );
    symlinkSync(
      join(root, "packages/disposabl-kit/server/release/verify-metadata.mjs"),
      join(stage, "packages/disposabl-kit/server/release/verify-metadata.mjs"),
    );
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: stage,
      NODE_ENV: "test",
      E2E_TELEMETRY_DISABLED: "1",
      DO_NOT_TRACK: "1",
      NPM_CONFIG_USERCONFIG: "/dev/null",
    };
    function command(executable: string, args: string[], cwd: string) {
      const result = spawnSync(executable, args, {
        cwd,
        env,
        encoding: "utf8",
        timeout: 120_000,
      });
      if (result.status !== 0)
        throw new Error(`SDK fixture ${executable} failed: ${result.stderr}`);
      return result.stdout;
    }
    command("bun", ["run", "build"], pkg);
    const packed = JSON.parse(
      command("npm", ["pack", "--json", "--pack-destination", stage], pkg),
    )[0] as {
      filename: string;
      integrity: string;
      version: string;
      files: { path: string }[];
    };
    const files = new Set(packed.files.map((file) => file.path));
    for (const required of [
      "package.json",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/verify-metadata.mjs",
    ])
      if (!files.has(required))
        throw new Error(`SDK tarball missing ${required}`);
    const tarball = join(stage, packed.filename);
    const digest = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
    if (digest !== packed.integrity)
      throw new Error("SDK tarball integrity mismatch");
    const install = join(stage, "install");
    mkdirSync(install);
    writeFileSync(
      join(install, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    command(
      "npm",
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        tarball,
      ],
      install,
    );
    const bridge = join(install, "package-export.mjs");
    writeFileSync(
      bridge,
      'export { client, usersCurrent } from "@disposabl/sdk";\n',
    );
    const sdk = (await import(
      pathToFileURL(bridge).href
    )) as typeof import("../../../sdk/src/index");
    writeFileSync(
      join(stage, "status.json"),
      JSON.stringify({
        status: "prepared",
        tarball,
        version: packed.version,
        integrity: digest,
      }),
    );
    return { sdk, stage, tarball, version: packed.version, integrity: digest };
  } catch (error) {
    writeFileSync(
      join(stage, "status.json"),
      JSON.stringify({ status: "failed", evidenceRetained: true }),
    );
    throw error;
  }
}
