import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
            `disposabl ${args.slice(0, 3).join(" ")} failed. The project remains available; retry setup from its directory.`,
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
  reference: string,
  run: CliRunner = runDisposabl,
) {
  if (
    !reference ||
    reference.trim() !== reference ||
    reference.length > 200 ||
    [...reference].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error(
      "Supply --reference with a branch, worktree name, or main.",
    );
  const status = (await run(["login", "status"])) as { currentUser: unknown };
  if (!status.currentUser) {
    await run(["login"], true);
    const verified = (await run(["login", "status"])) as {
      currentUser: unknown;
    };
    if (!verified.currentUser)
      throw new Error("Login completed without a verified user.");
  }
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
