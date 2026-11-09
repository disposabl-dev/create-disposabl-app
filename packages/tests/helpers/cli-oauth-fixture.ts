import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Bundle the central CLI with a test-only loopback entry, never the published binary. */
export async function createLocalCli(root: string, site: string) {
  if (
    ![
      "http://127.0.0.1:3311",
      ...(process.env.E2E_CLI_EXECUTABLE ? ["http://127.0.0.1:3531"] : []),
      "http://127.0.0.1:3541",
      "http://127.0.0.1:3551",
    ].includes(site)
  )
    throw new Error("Expected the local CLI fixture site.");
  const tempRoot = resolve(tmpdir());
  const realHome = resolve(homedir());
  if (tempRoot === realHome || tempRoot.startsWith(realHome + sep))
    throw new Error(
      "The CLI fixture requires a temporary directory outside the home directory.",
    );
  const directory = await mkdtemp(join(tempRoot, "disposabl-cli-oauth-"));
  const published = process.env.E2E_CLI_EXECUTABLE;
  const entry = join(directory, "entry.ts");
  const binary = join(directory, "cli.js");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: process.env.TMPDIR,
    DISPOSABL_CONFIG_DIR: join(directory, "credentials"),
    E2E_TELEMETRY_DISABLED: "1",
    DISPOSABL_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    EXPO_NO_TELEMETRY: "1",
    NODE_ENV: "development",
    NODE_USE_ENV_PROXY: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "localhost,127.0.0.1,::1",
  };
  const cleanup = () => rm(directory, { recursive: true, force: true });
  if (published) {
    if (site !== "http://127.0.0.1:3531" || !published.startsWith("/")) {
      await cleanup();
      throw new Error(
        "Published CLI requires an absolute executable and owned loopback site.",
      );
    }
    return {
      directory,
      binary: published,
      env: { ...env, DISPOSABL_API_ORIGIN: site },
      cleanup,
      published: true,
    };
  }
  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    await writeFile(
      entry,
      `import { runCli } from ${JSON.stringify(join(root, "packages/cli/commands.ts"))};\nrunCli(process.argv, ${JSON.stringify(site)}).catch(() => { console.error("CLI command failed"); process.exitCode = 1; });\n`,
    );
    await run("bun", ["build", entry, "--target=node", `--outfile=${binary}`], {
      env,
      timeout: 30_000,
    });
    return { directory, entry, binary, env, cleanup, published: false };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
