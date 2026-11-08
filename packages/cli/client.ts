import { Command } from "commander";
import { apiError } from "./errors";
import manifest from "./package.json";
import {
  identify,
  installedRelease,
  prepareLogin,
  telemetryStatePath,
  resetIdentity,
  telemetryConfig,
} from "./telemetry";
import {
  NotAuthenticated,
  accessToken,
  apiUrl,
  hasCredentials,
  login,
  loginAccessToken,
  logout,
} from "./auth";

export type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
};
export type Operation = {
  operationId: string;
  parameters?: {
    name: string;
    required?: boolean;
    content: { "application/json": { schema: Schema } };
  }[];
  requestBody?: { content: { "application/json": { schema: Schema } } };
};

type ProgramDependencies = {
  version?: string;
  telemetryPath?: string;
  login?: typeof login;
  logout?: typeof logout;
  hasCredentials?: typeof hasCredentials;
  accessToken?: typeof accessToken;
  loginAccessToken?: typeof loginAccessToken;
};

export function createProgram(
  serviceOrigin: string,
  centralAnalytics = false,
  dependencies: ProgramDependencies = {},
) {
  const version = dependencies.version ?? manifest.version;
  const path = () => dependencies.telemetryPath ?? telemetryStatePath();
  const sessionLogin = dependencies.login ?? login;
  const sessionLogout = dependencies.logout ?? logout;
  const sessionHasCredentials = dependencies.hasCredentials ?? hasCredentials;
  const sessionAccessToken = dependencies.accessToken ?? accessToken;
  const sessionLoginAccessToken =
    dependencies.loginAccessToken ?? loginAccessToken;
  const program = new Command()
    .name(Object.keys(manifest.bin)[0])
    .version(manifest.version);
  if (centralAnalytics)
    program.addHelpText(
      "after",
      "\nDisposabl collects limited CLI usage when configured. Set DO_NOT_TRACK=1 to opt out.\n",
    );
  const origin = () => apiUrl(serviceOrigin);
  const loginCommand = program
    .command("login")
    .option("--no-browser", "Print the login URL without opening a browser")
    .action(async (options) => {
      const base = origin();
      const central =
        centralAnalytics &&
        base === "https://www.disposabl.dev" &&
        installedRelease(version);
      const enabled = central && telemetryConfig(version);
      let attempt: string | undefined;
      if (central) {
        if (enabled) attempt = await prepareLogin(path());
        else await resetIdentity(path());
      }
      await sessionLogin(base, options.browser);
      if (
        centralAnalytics &&
        base === "https://www.disposabl.dev" &&
        telemetryConfig(version)
      ) {
        try {
          const token = await sessionLoginAccessToken(base);
          if (!token) throw new Error("No login token.");
          const response = await fetch(`${base}/api/users/current`, {
            headers: { Authorization: `Bearer ${token}` },
            redirect: "error",
            signal: AbortSignal.timeout(500),
          });
          if (response.ok)
            await identify(
              version,
              (await response.json())?.id,
              path(),
              attempt,
            );
        } catch {
          /* identity lookup is optional */
        }
      }
      console.error("Signed in.");
    });
  loginCommand
    .command("status")
    .description("Return the server-verified current user")
    .action(async () => {
      const base = origin();
      const enabled =
        centralAnalytics &&
        base === "https://www.disposabl.dev" &&
        telemetryConfig(version);
      if (!(await sessionHasCredentials(base))) {
        if (enabled) await resetIdentity(path());
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      const attempt = enabled ? await prepareLogin(path()) : undefined;
      const send = async (refresh = false) =>
        fetch(`${base}/api/users/current`, {
          headers: {
            Authorization: `Bearer ${await sessionAccessToken(base, refresh)}`,
            "X-Disposabl-Source": "cli",
          },
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
      let response: Response;
      try {
        response = await send();
        if (response.status === 401 && !process.env.DISPOSABL_API_KEY)
          response = await send(true);
      } catch (error) {
        if (!(error instanceof NotAuthenticated)) throw error;
        if (enabled) await resetIdentity(path());
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      if (response.status === 401) {
        if (enabled) await resetIdentity(path());
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      if (!response.ok)
        throw new Error(`Login status failed (${response.status}).`);
      const currentUser = await response.json();
      if (enabled) await identify(version, currentUser?.id, path(), attempt);
      console.log(JSON.stringify({ currentUser }));
    });
  program.command("logout").action(async () => {
    await sessionLogout(origin());
    if (
      centralAnalytics &&
      origin() === "https://www.disposabl.dev" &&
      installedRelease(version)
    )
      await resetIdentity(path());
    console.error("Signed out.");
  });

  return program;
}

export async function loadContract(base: string) {
  const response = await fetch(`${base}/openapi.json`, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Could not load OpenAPI (${response.status}).`);
  return (await response.json()) as {
    paths: Record<string, Record<string, Operation>>;
  };
}

export function operationFields(method: string, operation: Operation) {
  const schema = operation.requestBody?.content["application/json"].schema;
  return method === "get"
    ? (operation.parameters ?? []).map((p) => ({
        name: p.name,
        required: p.required,
        schema: p.content["application/json"].schema,
      }))
    : Object.entries(schema?.properties ?? {}).map(([name, value]) => ({
        name,
        required: schema?.required?.includes(name),
        schema: value,
      }));
}

export function addOperation(program: Command, path: string) {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#"))
    throw new Error("Invalid API path in contract.");
  const parts = path.slice(5).split("/");
  let parent = program;
  for (const part of parts.slice(0, -1))
    parent =
      parent.commands.find((command) => command.name() === part) ??
      parent.command(part);
  return parent.command(parts.at(-1)!);
}

export function requestOperation(
  base: string,
  path: string,
  method: string,
  input: Record<string, unknown>,
  timeout = 30_000,
) {
  const target = new URL(path, base);
  if (target.origin !== base || !target.pathname.startsWith("/api/"))
    throw new Error("Invalid operation URL.");
  if (method === "get")
    for (const [name, value] of Object.entries(input))
      target.searchParams.set(name, JSON.stringify(value));
  const send = async (refresh = false) =>
    fetch(target, {
      method: method.toUpperCase(),
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      headers: {
        Authorization: `Bearer ${await accessToken(base, refresh)}`,
        "Content-Type": "application/json",
        "X-Disposabl-Source": "cli",
      },
      body: method === "post" ? JSON.stringify(input) : undefined,
    });
  return async () => {
    const response = await send();
    return response.status === 401 && !process.env.DISPOSABL_API_KEY
      ? send(true)
      : response;
  };
}

export async function runApiCli(argv: string[], serviceOrigin: string) {
  const program = createProgram(serviceOrigin);
  if (needsContract(program, argv, serviceOrigin)) {
    const base = apiUrl(serviceOrigin);
    const spec = await loadContract(base);
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!["get", "post"].includes(method)) continue;
        const command = addOperation(program, path);
        const fields = operationFields(method, operation);
        for (const field of fields) {
          const flag = `--${field.name} <value>`;
          const description =
            field.schema.type === "string"
              ? field.name
              : `${field.name} as JSON`;
          if (field.required) command.requiredOption(flag, description);
          else command.option(flag, description);
        }
        command.action(async (options) => {
          const input = Object.fromEntries(
            fields
              .filter((field) => options[field.name] !== undefined)
              .map((field) => [
                field.name,
                field.schema.type === "string"
                  ? options[field.name]
                  : JSON.parse(options[field.name]),
              ]),
          );
          const response = await requestOperation(base, path, method, input)();
          if (!response.ok)
            throw new Error(apiError(response.status, await response.text()));
          console.log(JSON.stringify(await response.json(), null, 2));
        });
      }
    }
  }
  await program.parseAsync(argv);
}

/** Offline auth/version help remains usable even when the API is unavailable. */
export function needsContract(
  program: Command,
  argv: string[],
  origin: string,
) {
  const args = argv.slice(2);
  const { operands } = program.parseOptions(args);
  const command = operands[0] === "help" ? operands[1] : operands[0];
  return (
    Boolean(origin) &&
    !args.some((arg) => arg === "--version" || arg === "-V") &&
    command !== "login" &&
    command !== "logout"
  );
}
