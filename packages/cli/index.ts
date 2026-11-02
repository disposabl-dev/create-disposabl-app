#!/usr/bin/env node
import { Command } from "commander";
import manifest from "./package.json";
import { accessToken, apiUrl, login, logout } from "./auth";

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
  .version(manifest.version)
  .option(
    "--url <origin>",
    "Convex HTTP origin",
    process.env.DISPOSABL_API_URL,
  );
const origin = () => {
  const value = program.opts().url;
  if (!value)
    throw new Error(
      "Set --url https://your-app.convex.site or DISPOSABL_API_URL.",
    );
  return apiUrl(value);
};
program
  .command("login")
  .option("--no-browser", "Print the login URL without opening a browser")
  .action(async (options) => {
    await login(origin(), options.browser);
    console.error("Signed in.");
  });
program.command("logout").action(async () => {
  await logout(origin());
  console.error("Signed out.");
});

async function main() {
  // Help, version and login work without fetching the application contract.
  const args = process.argv.slice(2);
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
      if (!path.startsWith("/api/") || path.includes("?") || path.includes("#"))
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
        const schema =
          operation.requestBody?.content["application/json"].schema;
        const fields =
          method === "get"
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
        for (const field of fields) {
          const flag = `--${field.name} <value>`;
          if (field.required)
            command.requiredOption(
              flag,
              field.schema.type === "string"
                ? field.name
                : `${field.name} as JSON`,
            );
          else command.option(flag, field.name);
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
              signal: AbortSignal.timeout(30_000),
              headers: {
                Authorization: `Bearer ${await accessToken(base, refresh)}`,
                "Content-Type": "application/json",
              },
              body: method === "post" ? JSON.stringify(input) : undefined,
            });
          let result = await send();
          if (result.status === 401 && !process.env.DISPOSABL_API_KEY)
            result = await send(true);
          if (!result.ok)
            throw new Error(
              `API request failed (${result.status}): ${await result.text()}`,
            );
          console.log(JSON.stringify(await result.json(), null, 2));
        });
      }
    }
  }
  await program.parseAsync(process.argv);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
