import {
  checkValue,
  toJsonSchema,
  tool,
  type McpServer,
  type ToolCtx,
  type ToolDefinition,
} from "@convex-dev/mcp";
import { makeFunctionReference as reference } from "convex/server";
import {
  v,
  ConvexError,
  type GenericValidator,
  type PropertyValidators,
} from "convex/values";

type PlatformFunction = {
  isInternal?: boolean;
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  platforms?: true;
  args: PropertyValidators;
  returns: GenericValidator;
};

type Operation = {
  name: string;
  path: string;
  type: "query" | "mutation" | "action";
  args: ReturnType<typeof toJsonSchema>;
  returns: ReturnType<typeof toJsonSchema>;
};

/** One opt-in produces the shared JSON contract and both transport adapters. */
export function createPlatforms(
  modules: Record<string, Record<string, unknown>>,
) {
  const spec: Operation[] = [];
  const tools: Record<string, ToolDefinition> = Object.create(null);
  const routes = new Map<string, ToolDefinition>();
  for (const [path, exports] of Object.entries(modules)) {
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as Partial<PlatformFunction> | null;
      if (!fn?.isInternal || fn.platforms !== true) continue;
      const id = `${path}:${exportName}`;
      const name = id.replace(/[^A-Za-z0-9_.-]/g, "_");
      const route = `/api/${id.replace(/\/internal:/, "/").replace(":", "/")}`;
      if (Object.hasOwn(tools, name))
        throw new Error(`Duplicate platform tool name: ${name}`);
      if (routes.has(route)) throw new Error(`Duplicate API path: ${route}`);
      if (
        !fn.args ||
        !fn.returns ||
        !(fn.isQuery || fn.isMutation || fn.isAction)
      )
        throw new Error(`${id}: expected function kind, args and returns`);
      const { userId, ...args } = fn.args;
      if (!userId) throw new Error(`${id}: platform functions require userId`);
      const type = fn.isQuery ? "query" : fn.isMutation ? "mutation" : "action";
      spec.push({
        name: id,
        path: route,
        type,
        args: toJsonSchema(v.object(args)),
        returns: toJsonSchema(fn.returns),
      });
      tools[name] = tool({
        description: `Call ${id}.`,
        ...(fn.isQuery ? { annotations: { readOnlyHint: true } } : {}),
        args,
        returns: fn.returns,
        handler: async (ctx, input, user) => {
          const params = {
            ...input,
            userId: user.userId,
          };
          if (type === "query")
            return ctx.runQuery(reference<"query">(id), params);
          if (type === "mutation")
            return ctx.runMutation(reference<"mutation">(id), params);
          return ctx.runAction(reference<"action">(id), params);
        },
      });
      routes.set(route, tools[name]);
    }
  }
  return {
    spec,
    tools,
    async handleApi(
      ctx: ToolCtx,
      request: Request,
      authenticate: McpServer["authenticate"],
    ) {
      const url = new URL(request.url);
      const definition = routes.get(url.pathname);
      if (!definition)
        return Response.json({ error: "not_found" }, { status: 404 });
      const method =
        spec.find((operation) => operation.path === url.pathname)?.type ===
        "query"
          ? "GET"
          : "POST";
      if (request.method !== method)
        return Response.json(
          { error: "method_not_allowed" },
          { status: 405, headers: { Allow: method } },
        );
      try {
        const user = await authenticate(ctx, request);
        if (!user)
          return Response.json({ error: "unauthenticated" }, { status: 401 });
        if (definition.scope && !user.scopes.includes(definition.scope))
          return Response.json({ error: "forbidden" }, { status: 403 });
        const raw =
          request.method === "GET"
            ? Object.fromEntries(
                [...url.searchParams].map(([key, value]) => {
                  if (url.searchParams.getAll(key).length !== 1)
                    throw new SyntaxError("Duplicate argument");
                  return [key, JSON.parse(value)];
                }),
              )
            : await request.json();
        const input = checkValue(v.object(definition.args ?? {}), raw);
        if (!input.ok)
          return Response.json({ error: input.error }, { status: 400 });
        const result = await definition.handler(
          ctx,
          input.value as Record<string, unknown>,
          user,
        );
        return new Response(
          JSON.stringify(result ?? null, (_, value) =>
            typeof value === "bigint"
              ? value.toString()
              : value instanceof ArrayBuffer
                ? btoa(
                    Array.from(new Uint8Array(value), (byte) =>
                      String.fromCharCode(byte),
                    ).join(""),
                  )
                : value,
          ),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        if (error instanceof ConvexError)
          return Response.json(
            {
              error: error.data,
            },
            { status: 400 },
          );
        if (error instanceof SyntaxError)
          return Response.json({ error: "invalid_request" }, { status: 400 });
        console.error(error);
        return Response.json({ error: "internal_error" }, { status: 500 });
      }
    },
  };
}

/** The same validator schemas describe the HTTP transport and generated clients. */
export function createOpenApi(spec: Operation[], version = "0.1.0") {
  const ids = new Set<string>();
  return {
    openapi: "3.1.0",
    info: { title: "Application API", version },
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths: Object.fromEntries(
      spec.map((operation) => {
        const parts = operation.path.slice(5).split("/");
        const operationId = parts
          .map((part, i) =>
            i ? part.charAt(0).toUpperCase() + part.slice(1) : part,
          )
          .join("");
        if (ids.has(operationId))
          throw new Error(`Duplicate operation ID: ${operationId}`);
        ids.add(operationId);
        const query = operation.type === "query";
        const args = operation.args as {
          properties?: Record<string, unknown>;
          required?: string[];
        };
        return [
          operation.path,
          {
            [query ? "get" : "post"]: {
              operationId,
              "x-convex-function": operation.name,
              ...(query
                ? {
                    parameters: Object.entries(args.properties ?? {}).map(
                      ([name, schema]) => ({
                        name,
                        in: "query",
                        required: args.required?.includes(name) ?? false,
                        content: { "application/json": { schema } },
                      }),
                    ),
                  }
                : {
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": { schema: operation.args },
                      },
                    },
                  }),
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": { schema: operation.returns },
                  },
                },
                "400": { description: "Invalid arguments" },
                "401": { description: "Authentication required" },
                "403": { description: "Insufficient scope" },
                "500": { description: "Internal error" },
              },
            },
          },
        ];
      }),
    ),
  };
}
