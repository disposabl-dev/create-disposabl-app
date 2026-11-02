import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectReference } from "../cli/preview";

export type CliRunner = (
  args: string[],
  interactive?: boolean,
) => Promise<unknown>;
export const runDisposabl: CliRunner = (args, interactive = false) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./disposabl.js", import.meta.url)), ...args],
      {
        stdio: interactive
          ? ["inherit", "inherit", "inherit"]
          : ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `disposabl ${args.slice(0, 3).join(" ")} failed. Your files are saved. Retry from the parent directory: bun create disposabl-app@latest <app-directory> --setup`,
          ),
        );
        return;
      }
      try {
        resolve(interactive ? undefined : JSON.parse(output));
      } catch {
        reject(new Error("Invalid response from disposabl CLI."));
      }
    });
  });

/** The generator orchestrates CLI commands; OAuth and token storage belong to disposabl. */
export async function setupApp(
  directory: string,
  name: string,
  run: CliRunner = runDisposabl,
) {
  const reference = detectReference(directory);
  const status = (await run(["login", "status"])) as { currentUser: unknown };
  if (!status.currentUser) {
    await run(["login"], true);
    const verified = (await run(["login", "status"])) as {
      currentUser: unknown;
    };
    if (!verified.currentUser)
      throw new Error("Login completed without a verified user.");
  }
  const connections = (await run(["connections", "status", "--wait"])) as {
    ready: boolean;
  };
  if (!connections.ready)
    throw new Error(
      "Connect GitHub and Convex at https://www.disposabl.dev/dashboard/connections, then retry: bun create disposabl-app@latest " +
        directory +
        " --setup. Your app files and login are saved.",
    );
  const path = join(directory, "disposabl.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  if (config.appId) {
    await run(["apps", "get", "--appId", config.appId]);
  } else {
    const app = (await run([
      "apps",
      "create",
      "--name",
      name,
      "--platforms",
      JSON.stringify(config.platforms),
    ])) as { appId: string };
    config.appId = app.appId;
    await writeFile(path, JSON.stringify(config, null, 2) + "\n");
    execFileSync("bun", ["fmt", "disposabl.json"], {
      cwd: directory,
      stdio: "pipe",
    });
  }
  await run([
    "previews",
    "token",
    "create",
    "--appId",
    config.appId,
    "--reference",
    reference,
    "--configure",
    directory,
  ]);
  return config.appId as string;
}

export async function install(directory: string, interactive: boolean) {
  await new Promise<void>((done, reject) => {
    const child = spawn("bun", ["install"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    });
    let detail = "";
    const onData = (chunk: Buffer) => {
      detail = (detail + chunk.toString()).slice(-4000);
      if (!interactive) process.stderr.write(chunk);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? done()
        : reject(
            new Error(
              "bun install failed. The project was created at " +
                directory +
                ". Run bun install there to retry.\n" +
                detail.trim(),
            ),
          ),
    );
  });
}

export function commitApp(directory: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  git("add", "--all");
  const hasIdentity =
    spawnSync("git", ["var", "GIT_AUTHOR_IDENT"], {
      cwd: directory,
      stdio: "ignore",
    }).status === 0;
  git(
    ...(hasIdentity
      ? []
      : [
          "-c",
          "user.name=create-disposabl-app",
          "-c",
          "user.email=create-disposabl-app@users.noreply.github.com",
        ]),
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Initial commit",
  );
}
