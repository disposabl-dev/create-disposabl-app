import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectReference } from "../cli/preview";
import { resolveFeatures } from "../disposabl-kit/feature-options";
import { validateAndroidArchitectures } from "../disposabl-kit/android-architectures";
import { apiUrl, SERVICE_ORIGIN } from "../cli/origin";

export type CliRunner = (
  args: string[],
  interactive?: boolean,
) => Promise<unknown>;
export const runDisposabl = (
  args: string[],
  interactive = false,
  origin?: string,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./disposabl.js", import.meta.url)), ...args],
      {
        env: {
          ...process.env,
          ...(origin ? { DISPOSABL_API_ORIGIN: origin } : {}),
        },
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
            `disposabl ${args.slice(0, 3).join(" ")} failed. Your files are saved. Retry from the parent directory: bun create disposabl-app@latest <app-directory>`,
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
  const path = join(directory, "disposabl.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  const origin = apiUrl(
    process.env.DISPOSABL_API_ORIGIN || config.serviceOrigin || SERVICE_ORIGIN,
  );
  if (
    config.appId &&
    config.serviceOrigin &&
    apiUrl(config.serviceOrigin) !== origin
  )
    throw new Error(
      "This app belongs to a different Disposabl service. Use its saved service origin.",
    );
  config.serviceOrigin = origin;
  if (run === runDisposabl)
    run = (args, interactive) => runDisposabl(args, interactive, origin);
  config.features = resolveFeatures(config.features ?? []);
  config.androidArchitectures = validateAndroidArchitectures(
    config.androidArchitectures,
  );
  // Persist dependencies before leaving the terminal for any connection flow.
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
  const status = (await run(["login", "status"])) as { currentUser: unknown };
  if (!status.currentUser) {
    await run(["login"], true);
    const verified = (await run(["login", "status"])) as {
      currentUser: unknown;
    };
    if (!verified.currentUser)
      throw new Error("Login completed without a verified user.");
  }
  const connections = (await run([
    "connections",
    "status",
    "--features",
    JSON.stringify(config.features),
    "--wait",
    "--setup-origin",
    ...(config.platforms.some((p: string) => p === "ios" || p === "android")
      ? ["--mobile"]
      : []),
  ])) as {
    ready: boolean;
    connectionsUrl?: string;
  };
  if (!connections.ready)
    throw new Error(
      `Finish connecting your app's accounts at ${connections.connectionsUrl ?? "https://www.disposabl.dev/dashboard/connections"}, then retry from the parent directory: bun create disposabl-app@latest ` +
        basename(directory) +
        ". Your app files and login are saved.",
    );
  if (!config.appId) {
    const app = (await run([
      "apps",
      "create",
      "--name",
      name,
      "--platforms",
      JSON.stringify(config.platforms),
      "--features",
      JSON.stringify(config.features),
      "--androidArchitectures",
      JSON.stringify(config.androidArchitectures),
    ])) as { appId: string };
    config.appId = app.appId;
    await writeFile(path, JSON.stringify(config, null, 2) + "\n");
    execFileSync("bun", ["fmt", "disposabl.json"], {
      cwd: directory,
      stdio: "pipe",
    });
  }
  const configured = (await run([
    "previews",
    "token",
    "create",
    "--appId",
    config.appId,
    "--reference",
    reference,
    "--platforms",
    JSON.stringify(config.platforms),
    "--features",
    JSON.stringify(config.features),
    "--androidArchitectures",
    JSON.stringify(config.androidArchitectures),
    "--configurationLease",
    "true",
    "--configure",
    directory,
  ])) as { configured?: boolean; configurationLeaseUntil?: number };
  if (
    configured?.configured !== true ||
    !Number.isSafeInteger(configured.configurationLeaseUntil) ||
    configured.configurationLeaseUntil! <= 0
  )
    throw new Error(
      "Local configuration did not return a valid setup lease. Retry setup.",
    );
  await run([
    "previews",
    "token",
    "complete",
    "--appId",
    config.appId,
    "--until",
    String(configured.configurationLeaseUntil),
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
