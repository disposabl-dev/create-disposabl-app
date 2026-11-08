import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { lock } from "proper-lockfile";
import { credentialRevision } from "./auth";

type State = {
  anonymousId: string;
  credentialRevision: string;
  userId?: string;
  loginAttempt?: string;
};
type Product = "cli" | "generator";
type Outcome = "started" | "success" | "failure" | "cancelled";

// The public project token must be provided by the release configuration. Never
// use the generated app's PostHog project or a personal API key here.
export function installedRelease(
  version: string,
  entry = process.argv[1] ?? "",
) {
  try {
    entry = realpathSync(entry);
  } catch {
    // The production binary can be replaced while it is running.
  }
  return (
    /(?:^|[\\/])node_modules[\\/]/.test(entry) &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) &&
    !version.includes("development")
  );
}

export function telemetryConfig(
  version: string,
  entry = process.argv[1] ?? "",
) {
  const env = process.env;
  const host = process.env.DISPOSABL_CLI_POSTHOG_HOST;
  const token = process.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN;
  if (
    !installedRelease(version, entry) ||
    env.NODE_ENV === "test" ||
    env.NODE_ENV === "development" ||
    env.BUN_ENV === "test" ||
    env.CI ||
    env.E2E_TELEMETRY_DISABLED ||
    ["1", "true"].includes(env.DO_NOT_TRACK?.toLowerCase() ?? "") ||
    env.DISPOSABL_TELEMETRY_DISABLED === "1" ||
    env.DISPOSABL_API_KEY ||
    (env.DISPOSABL_API_ORIGIN &&
      env.DISPOSABL_API_ORIGIN !== "https://www.disposabl.dev") ||
    !token?.startsWith("phc_") ||
    !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
      host ?? "",
    )
  )
    return null;
  return { token, host: host! };
}

const directory = () => join(homedir(), ".config", "disposabl");
export const telemetryStatePath = () => join(directory(), "telemetry.json");
async function state(path: string): Promise<State> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as State;
    if (
      /^[0-9a-f-]{36}$/.test(value.anonymousId) &&
      (!value.userId || /^[a-zA-Z0-9_-]{1,128}$/.test(value.userId))
    )
      return value;
  } catch {
    /* create a fresh anonymous ID */
  }
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const fresh = {
    anonymousId: randomUUID(),
    credentialRevision: await credentialRevision(),
  };
  try {
    await writeFile(path, JSON.stringify(fresh), { mode: 0o600, flag: "wx" });
    return fresh;
  } catch {
    const value = JSON.parse(await readFile(path, "utf8")) as State;
    if (
      !/^[0-9a-f-]{36}$/.test(value.anonymousId) ||
      (value.userId && !/^[a-zA-Z0-9_-]{1,128}$/.test(value.userId))
    )
      throw new Error("Invalid telemetry state");
    return value;
  }
}
async function synchronized<T>(
  path: string,
  run: () => Promise<T>,
): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const release = await lock(path, {
    realpath: false,
    stale: 5000,
    retries: { retries: 20, minTimeout: 50, maxTimeout: 50 },
  });
  try {
    return await run();
  } finally {
    await release();
  }
}
async function send(
  config: NonNullable<ReturnType<typeof telemetryConfig>>,
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
) {
  const response = await fetch(`${config.host}/i/v0/e/`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(500),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.token,
      event,
      distinct_id: distinctId,
      properties: { ...properties, $geoip_disable: true, $ip: "0.0.0.0" },
    }),
  });
  return response.ok;
}

export async function capture(
  version: string,
  product: Product,
  command: string,
  outcome: Outcome,
  path: string,
) {
  const config = telemetryConfig(version);
  if (!config) return;
  try {
    const current = await synchronized(path, () => state(path));
    // A failed rotation must not preserve a prior account after credentials change.
    if (current.credentialRevision !== (await credentialRevision())) return;
    const allowed = [
      "agent",
      "login",
      "logout",
      "apps",
      "previews",
      "connections",
      "users",
      "help",
      "version",
      "other",
      "create",
    ];
    await send(config, "cli_command", current.userId ?? current.anonymousId, {
      product,
      command: allowed.includes(command) ? command : "other",
      outcome,
      version,
      invocation:
        process.env.npm_command === "exec"
          ? "npx"
          : (/^(npm|pnpm|yarn|bun)\//.exec(
              process.env.npm_config_user_agent ?? "",
            )?.[1] ?? "direct"),
      platform: ["darwin", "linux", "win32"].includes(process.platform)
        ? process.platform
        : "other",
      ...(!current.userId ? { $process_person_profile: false } : {}),
    });
  } catch {
    /* analytics must not affect the command */
  }
}

// A new attempt invalidates any earlier in-flight login. A linked identity
// gets a new anonymous ID before another account can use it.
export async function prepareLogin(path: string): Promise<string | undefined> {
  try {
    return await synchronized(path, async () => {
      const current = await state(path);
      const loginAttempt = randomUUID();
      const next = {
        anonymousId:
          current.userId || current.loginAttempt
            ? randomUUID()
            : current.anonymousId,
        loginAttempt,
        credentialRevision: await credentialRevision(),
      };
      await writeFile(path, JSON.stringify(next), { mode: 0o600 });
      return loginAttempt;
    });
  } catch {
    return undefined;
  }
}

export async function identify(
  version: string,
  userId: unknown,
  path: string,
  attempt: string | undefined,
  revision: string | undefined = undefined,
) {
  const config = telemetryConfig(version);
  if (
    !config ||
    !attempt ||
    typeof userId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(userId)
  )
    return;
  try {
    // Direct callers also bind to a snapshot taken before waiting for the lock.
    const expectedRevision = revision ?? (await credentialRevision());
    await synchronized(path, async () => {
      // Do not recreate state after logout or a later login.
      const current = JSON.parse(await readFile(path, "utf8")) as State;
      if (
        current.loginAttempt !== attempt ||
        expectedRevision !== (await credentialRevision()) ||
        current.userId ||
        !/^[0-9a-f-]{36}$/.test(current.anonymousId)
      )
        return;
      const opaqueId = createHash("sha256")
        .update(`disposabl:${config.token}:${userId}`)
        .digest("hex");
      if (
        await send(config, "$identify", opaqueId, {
          $anon_distinct_id: current.anonymousId,
        })
      ) {
        await writeFile(
          path,
          JSON.stringify({
            anonymousId: current.anonymousId,
            userId: opaqueId,
            credentialRevision: expectedRevision,
          }),
          { mode: 0o600 },
        );
      }
    });
  } catch {
    /* analytics must not affect login */
  }
}

export async function resetIdentity(path: string, attempt?: string) {
  try {
    await synchronized(path, async () => {
      if (attempt) {
        const current = JSON.parse(await readFile(path, "utf8")) as State;
        if (current.loginAttempt !== attempt) return;
      }
      await rm(path, { force: true });
    });
  } catch {
    /* analytics must not affect authentication */
  }
}
