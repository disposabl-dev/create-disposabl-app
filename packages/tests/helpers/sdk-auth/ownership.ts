import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

function fail(): never {
  throw new Error(
    "SDK fixture requires its own fresh backend and matched listeners",
  );
}

function within(parent: string, path: string) {
  const part = relative(parent, path);
  return (
    part !== "" &&
    !isAbsolute(part) &&
    part !== ".." &&
    !part.startsWith(`..${sep}`)
  );
}

function inspect(command: string, args: string[]) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return fail();
  }
}

function parentPid(pid: number) {
  const fields = inspect("lsof", [
    "-nP",
    "-a",
    "-p",
    String(pid),
    "-d",
    "cwd",
    "-FpR",
  ]).split("\n");
  const parents = fields.filter((line) => line.startsWith("R"));
  if (!fields.includes(`p${pid}`) || parents.length !== 1) fail();
  const parent = Number(parents[0].slice(1));
  if (!Number.isSafeInteger(parent) || parent < 1) fail();
  return parent;
}

/** Local process evidence only. The launcher creates the marker before the database. */
export function assertOwnedSdkBackend({
  markerVariable = "E2E_SDK_OWNERSHIP_FILE",
  ports = [3530, 3531],
  claimDirectory = ".sdk-auth-claimed",
}: {
  markerVariable?: string;
  ports?: readonly [number, number];
  claimDirectory?: string;
} = {}) {
  const supplied = process.env[markerVariable];
  if (!supplied || !isAbsolute(supplied)) fail();
  const marker = realpathSync(supplied);
  const directory = dirname(marker);
  const temporary = realpathSync("/tmp");
  if (!within(temporary, directory) || basename(marker) !== "ownership.json")
    fail();
  const metadata = lstatSync(supplied);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid?.() ||
    (metadata.mode & 0o077) !== 0
  )
    fail();
  const lease = JSON.parse(readFileSync(marker, "utf8")) as {
    version: number;
    launcherPid: number;
    backendPid: number;
    database: string;
  };
  if (
    lease.version !== 1 ||
    !Number.isSafeInteger(lease.launcherPid) ||
    lease.launcherPid < 2 ||
    !Number.isSafeInteger(lease.backendPid) ||
    lease.backendPid < 2
  )
    fail();
  // A copied marker from another fixture must not authorize this process.
  let ancestor = process.pid;
  const seen = new Set<number>();
  while (ancestor > 1 && ancestor !== lease.launcherPid) {
    if (seen.has(ancestor)) fail();
    seen.add(ancestor);
    ancestor = parentPid(ancestor);
  }
  if (
    ancestor !== lease.launcherPid ||
    parentPid(lease.backendPid) !== lease.launcherPid
  )
    fail();
  if (
    !inspect("lsof", [
      "-nP",
      "-a",
      "-p",
      String(lease.backendPid),
      "-d",
      "txt",
      "-Fn",
    ])
      .split("\n")
      .some(
        (line) =>
          line.startsWith("n") &&
          basename(line.slice(1)) === "convex-local-backend",
      )
  )
    fail();
  const database = realpathSync(lease.database);
  if (!within(directory, database)) fail();
  const db = lstatSync(lease.database);
  if (
    !db.isFile() ||
    db.isSymbolicLink() ||
    db.uid !== metadata.uid ||
    metadata.birthtimeMs <= 0 ||
    db.birthtimeMs < metadata.birthtimeMs
  )
    fail();
  for (const port of ports) {
    const listener = inspect("lsof", [
      "-nP",
      "-a",
      "-p",
      String(lease.backendPid),
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-Fn",
    ]);
    const addresses = listener
      .split("\n")
      .filter((line) => line.startsWith("n"));
    if (addresses.length !== 1 || addresses[0] !== `n127.0.0.1:${port}`) fail();
  }
  const opened = inspect("lsof", [
    "-a",
    "-p",
    String(lease.backendPid),
    "-Fn",
    "--",
    database,
  ]);
  if (!opened.split("\n").includes(`n${database}`)) fail();
  // No retries may silently reuse a database already mutated by an earlier run.
  mkdirSync(join(directory, claimDirectory), { mode: 0o700 });
}
