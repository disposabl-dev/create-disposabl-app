import { completeExpoDeletion } from "./delete";
import { Command } from "commander";
import manifest from "./package.json";
import {
  NotAuthenticated,
  accessToken,
  apiUrl,
  hasCredentials,
  login,
  logout,
  openUrl,
} from "./auth";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  configureDevelopment,
  detectReference,
  formatPreview,
} from "./preview";

export const SERVICE_ORIGIN = "https://www.disposabl.dev";
export async function runCli(
  argv = process.argv,
  serviceOrigin = SERVICE_ORIGIN,
) {
  type Schema = {
    type?: string;
    properties?: Record<string, Schema>;
    required?: string[];
  };
  type Operation = {
    operationId: string;
    parameters?: {
      name: string;
      required?: boolean;
      content: { "application/json": { schema: Schema } };
    }[];
    requestBody?: { content: { "application/json": { schema: Schema } } };
  };
  const program = new Command()
    .name(Object.keys(manifest.bin)[0])
    .version(manifest.version);
  const origin = () => apiUrl(serviceOrigin);
  const loginCommand = program
    .command("login")
    .option("--no-browser", "Print the login URL without opening a browser")
    .action(async (options) => {
      await login(origin(), options.browser);
      console.error("Signed in.");
    });
  loginCommand
    .command("status")
    .description("Return the server-verified current user")
    .action(async () => {
      const base = origin();
      if (!(await hasCredentials(base))) {
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      const send = async (refresh = false) =>
        fetch(`${base}/api/users/current`, {
          headers: {
            Authorization: `Bearer ${await accessToken(base, refresh)}`,
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
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      if (response.status === 401) {
        console.log(JSON.stringify({ currentUser: null }));
        return;
      }
      if (!response.ok)
        throw new Error(`Login status failed (${response.status}).`);
      console.log(JSON.stringify({ currentUser: await response.json() }));
    });
  program.command("logout").action(async () => {
    await logout(origin());
    console.error("Signed out.");
  });

  async function main() {
    // Help, version and login work without fetching the application contract.
    const args = argv.slice(2);
    const global = program.parseOptions(args);
    const commandName = global.operands[0];
    if (commandName && !["login", "logout", "help"].includes(commandName)) {
      const base = origin();
      const response = await fetch(`${base}/openapi.json`, {
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(`Could not load OpenAPI (${response.status}).`);
      const spec = (await response.json()) as {
        paths: Record<string, Record<string, Operation>>;
      };
      for (const [path, methods] of Object.entries(spec.paths)) {
        if (
          !path.startsWith("/api/") ||
          path.includes("?") ||
          path.includes("#")
        )
          throw new Error("Invalid API path in contract.");
        for (const [method, operation] of Object.entries(methods)) {
          if (!["get", "post"].includes(method)) continue;
          const parts = path.slice(5).split("/");
          let parent = program;
          for (const part of parts.slice(0, -1))
            parent =
              parent.commands.find((command) => command.name() === part) ??
              parent.command(part);
          const command = parent.command(parts.at(-1)!);
          const connectionStatus = path === "/api/connections/status";
          if (connectionStatus)
            command.option(
              "--wait",
              "Open Connections and continue when GitHub and Convex are connected",
            );
          const deleteApp = path === "/api/apps/delete";
          const previewGet = path === "/api/previews/get";
          const tokenCreate = path === "/api/previews/token/create";
          if (previewGet)
            command.option("--json", "Print the full preview as JSON");
          if (tokenCreate)
            command.option(
              "--configure <directory>",
              "Write local development environment files",
            );
          const schema =
            operation.requestBody?.content["application/json"].schema;
          const fields =
            method === "get"
              ? (operation.parameters ?? []).map((p) => ({
                  name: p.name,
                  required: p.required,
                  schema: p.content["application/json"].schema,
                }))
              : Object.entries(schema?.properties ?? {}).map(
                  ([name, value]) => ({
                    name,
                    required: schema?.required?.includes(name),
                    schema: value,
                  }),
                );
          for (const field of fields) {
            if (deleteApp && field.name === "dangerouslyDeleteApp") {
              command.option(
                "--dangerously-delete-app",
                "Permanently delete this preview app and its GitHub, Convex and Expo projects",
              );
              continue;
            }
            const flag = `--${field.name} <value>`;
            if (
              field.required &&
              !(field.name === "appId" && (previewGet || tokenCreate)) &&
              !(field.name === "reference" && (previewGet || tokenCreate))
            )
              command.requiredOption(
                flag,
                field.schema.type === "string"
                  ? field.name
                  : `${field.name} as JSON`,
              );
            else command.option(flag, field.name);
          }
          command.action(async (options) => {
            if (deleteApp && options.dangerouslyDeleteApp !== true)
              throw new Error(
                "Permanent deletion requires --dangerously-delete-app. Apps with production releases cannot be deleted.",
              );
            if ((previewGet || tokenCreate) && !options.appId) {
              const config = JSON.parse(
                await readFile(
                  join(options.configure ?? process.cwd(), "disposabl.json"),
                  "utf8",
                ),
              );
              if (!config.appId)
                throw new Error(
                  "No appId in disposabl.json. Run setup or pass --appId.",
                );
              options.appId = config.appId;
            }
            if ((previewGet || tokenCreate) && !options.reference)
              options.reference = detectReference(options.configure);
            const input = Object.fromEntries(
              fields
                .filter((field) => options[field.name] !== undefined)
                .map((field) => [
                  field.name,
                  field.schema.type === "string" ||
                  typeof options[field.name] === "boolean"
                    ? options[field.name]
                    : JSON.parse(options[field.name]),
                ]),
            );
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
                signal: AbortSignal.timeout(deleteApp ? 300_000 : 30_000),
                headers: {
                  Authorization: `Bearer ${await accessToken(base, refresh)}`,
                  "Content-Type": "application/json",
                },
                body: method === "post" ? JSON.stringify(input) : undefined,
              });
            let result = await send();
            if (result.status === 401 && !process.env.DISPOSABL_API_KEY)
              result = await send(true);
            if (deleteApp && result.status === 400) {
              const body = await result.clone().json();
              if (body.error?.code === "expo_delete_requires_login") {
                await completeExpoDeletion(body.error.projectId);
                result = await send();
              }
            }
            if (!result.ok)
              throw new Error(
                `API request failed (${result.status}): ${await result.text()}`,
              );
            let value = await result.json();
            if (connectionStatus && options.wait && !value.ready) {
              const url = `${base}/dashboard/connections`;
              console.error(
                `Connect your GitHub and Convex accounts:\n${url}\nWaiting for connections. Press Ctrl+C to keep your files and finish later.`,
              );
              openUrl(url);
              const deadline = Date.now() + 15 * 60_000;
              while (!value.ready && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                result = await send();
                if (result.status === 401 && !process.env.DISPOSABL_API_KEY)
                  result = await send(true);
                if (!result.ok)
                  throw new Error(
                    `Connection status failed (${result.status}). Your login and app files are saved.`,
                  );
                value = await result.json();
              }
              if (!value.ready)
                throw new Error(
                  `Connections are still incomplete. Finish at ${url}, then retry setup.`,
                );
            }
            if (tokenCreate && options.configure) {
              await configureDevelopment(options.configure, value);
              const { deployKey: _secret, ...details } = value;
              console.log(
                JSON.stringify({ ...details, configured: true }, null, 2),
              );
            } else if (previewGet && !options.json)
              console.log(formatPreview(value));
            else console.log(JSON.stringify(value, null, 2));
          });
        }
      }
    }
    await program.parseAsync(argv);
  }
  await main();
}
