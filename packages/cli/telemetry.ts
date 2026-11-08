import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type State = { anonymousId: string; userId?: string };
type Product = "cli" | "generator";
type Outcome = "started" | "success" | "failure" | "cancelled";

// The public project token must be provided by the release configuration. Never
// use the generated app's PostHog project or a personal API key here.
export function installedRelease(
  version: string,
  entry = process.argv[1] ?? "",
) {
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
  const host = env.DISPOSABL_CLI_POSTHOG_HOST;
  const token = env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN;
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
const statePath = () => join(directory(), "telemetry.json");
async function state(path = statePath()): Promise<State> {
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
  const fresh = { anonymousId: randomUUID() };
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
  path = statePath(),
) {
  const config = telemetryConfig(version);
  if (!config) return;
  try {
    const current = await state(path);
    const allowed = [
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

export async function identify(
  version: string,
  userId: unknown,
  path = statePath(),
) {
  const config = telemetryConfig(version);
  if (
    !config ||
    typeof userId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(userId)
  )
    return;
  try {
    const current = await state(path);
    if (current.userId === userId) return;
    if (current.userId) return; // Rotate before another login, never merge accounts.
    if (
      await send(config, "$identify", userId, {
        $anon_distinct_id: current.anonymousId,
      })
    ) {
      await writeFile(path, JSON.stringify({ ...current, userId }), {
        mode: 0o600,
      });
    }
  } catch {
    /* analytics must not affect login */
  }
}

// On logout and before switching accounts, forget the linked anonymous ID.
export async function resetIdentity(
  onlyIfIdentified = false,
  path = statePath(),
) {
  try {
    if (onlyIfIdentified) {
      const current = JSON.parse(await readFile(path, "utf8")) as State;
      if (!current.userId) return;
    }
    await rm(path, { force: true });
  } catch {
    /* analytics must not affect authentication */
  }
}
