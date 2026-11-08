import { openExpoDeletion } from "./delete";
import { capture } from "./telemetry";
import { version } from "./package.json";
import { apiError } from "./errors";
import { openUrl } from "./auth";
import { apiUrl, SERVICE_ORIGIN } from "./origin";
import {
  createProgram,
  loadContract,
  addOperation,
  operationFields,
  requestOperation,
  needsContract,
} from "./client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configureRepository } from "./repository";
import {
  configureDevelopment,
  detectReference,
  formatPreview,
} from "./preview";

export { SERVICE_ORIGIN } from "./origin";
export async function runCli(
  argv = process.argv,
  serviceOrigin = process.env.DISPOSABL_API_ORIGIN || SERVICE_ORIGIN,
) {
  const program = createProgram(serviceOrigin, true);
  const origin = () => apiUrl(serviceOrigin);

  async function main() {
    if (needsContract(program, argv, serviceOrigin)) {
      const base = origin();
      const spec = await loadContract(base);
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!["get", "post"].includes(method)) continue;
          const command = addOperation(program, path);
          const connectionStatus = path === "/api/connections/status";
          if (connectionStatus)
            command.option(
              "--wait",
              "Open setup and continue when GitHub and Convex are ready",
            );
          if (connectionStatus)
            command.option(
              "--setup-origin",
              "Show the terminal setup completion screen",
            );
          if (connectionStatus)
            command.option(
              "--mobile",
              "Also wait for Expo when creating a mobile app",
            );
          const deleteApp = path === "/api/apps/delete";
          if (deleteApp)
            command.option(
              "--no-browser",
              "Print the Expo cleanup URL without opening a browser",
            );
          const previewGet = path === "/api/previews/get";
          const tokenCreate = path === "/api/previews/token/create";
          const repositoryToken = path === "/api/apps/repositoryToken";
          if (repositoryToken)
            command.option(
              "--configure",
              "Save repository credentials privately outside the project",
            );
          if (previewGet)
            command.option("--json", "Print the full preview as JSON");
          if (tokenCreate)
            command.option(
              "--configure <directory>",
              "Write local development environment files",
            );
          const fields = operationFields(method, operation);
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
            const send = requestOperation(
              base,
              path,
              method,
              input,
              deleteApp ? 300_000 : 30_000,
            );
            let result = await send();
            if (deleteApp && !result.ok)
              openExpoDeletion(
                await result
                  .clone()
                  .json()
                  .catch(() => null),
                options.appId,
                options.browser !== false,
              );
            if (!result.ok)
              throw new Error(apiError(result.status, await result.text()));
            let value = await result.json();
            const ready = () =>
              value.ready && (!options.mobile || Boolean(value.expo));
            if (connectionStatus && options.wait && !ready()) {
              const requested = Array.isArray(input.features)
                ? input.features
                : [];
              const connections = new URL("/dashboard/connections", base);
              if (options.setupOrigin)
                connections.searchParams.set("origin", "cli");
              const requiredFeatures = requested.filter(
                (f: string) => f === "analytics" || f === "payments",
              );
              if (requiredFeatures.length)
                connections.searchParams.set(
                  "features",
                  requiredFeatures.join(","),
                );
              if (options.mobile) connections.searchParams.set("mobile", "1");
              const url = connections.href;
              const names: Record<string, string> = {
                github: "GitHub",
                convex: "Convex",
                posthog: "PostHog",
                expo: "Expo",
                autumn: "Autumn",
              };
              const missing = Array.isArray(value.missing)
                ? value.missing
                    .map((id: string) => names[id] ?? id)
                    .join(" and ")
                : "GitHub and Convex";
              console.error(
                `Connect ${missing} for this app:\n${url}\nWaiting for connections. Press Ctrl+C to keep your files and finish later.`,
              );
              openUrl(url);
              const deadline = Date.now() + 15 * 60_000;
              while (!ready() && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                result = await send();
                if (!result.ok)
                  throw new Error(
                    `Connection status failed (${result.status}). Your login and app files are saved.`,
                  );
                value = await result.json();
              }
              if (!ready())
                throw new Error(
                  `Connections are still incomplete. Finish at ${url}, then retry setup.`,
                );
            }
            if (repositoryToken && options.configure) {
              console.log(
                JSON.stringify(
                  await configureRepository(base, options.appId, value),
                  null,
                  2,
                ),
              );
            } else if (tokenCreate && options.configure) {
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
  const command = argv[2] ?? "help";
  const central = serviceOrigin === SERVICE_ORIGIN;
  if (central) await capture(version, "cli", command, "started");
  try {
    await main();
    if (central) await capture(version, "cli", command, "success");
  } catch (error) {
    if (central) await capture(version, "cli", command, "failure");
    throw error;
  }
}
