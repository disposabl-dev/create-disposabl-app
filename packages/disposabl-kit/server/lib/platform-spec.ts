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
            ...(userId ? { userId: user.userId } : {}),
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
      const definition = routes.get(new URL(request.url).pathname);
      if (!definition)
        return Response.json({ error: "not_found" }, { status: 404 });
      try {
        const user = await authenticate(ctx, request);
        if (!user)
          return Response.json({ error: "unauthenticated" }, { status: 401 });
        if (definition.scope && !user.scopes.includes(definition.scope))
          return Response.json({ error: "forbidden" }, { status: 403 });
        const input = checkValue(
          v.object(definition.args ?? {}),
          await request.json(),
        );
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
        if (error instanceof SyntaxError || error instanceof ConvexError)
          return Response.json({ error: "invalid_request" }, { status: 400 });
        console.error(error);
        return Response.json({ error: "internal_error" }, { status: 500 });
      }
    },
  };
}
