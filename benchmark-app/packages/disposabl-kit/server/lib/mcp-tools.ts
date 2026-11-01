import { tool, type ToolDefinition } from "@convex-dev/mcp";
import { makeFunctionReference as reference } from "convex/server";
import type { GenericValidator, PropertyValidators } from "convex/values";

type PlatformFunction = {
  isInternal?: boolean;
  isQuery?: boolean;
  isMutation?: boolean;
  mcp?: boolean;
  args: PropertyValidators;
  returns: GenericValidator;
};

/** Adapt opted-in internal functions without duplicating their validators. */
export function createMcpTools(
  modules: Record<string, Record<string, unknown>>,
) {
  const tools: Record<string, ToolDefinition> = Object.create(null);
  for (const [path, exports] of Object.entries(modules)) {
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as PlatformFunction | null;
      if (!fn?.isInternal || !fn.mcp) continue;
      const id = `${path}:${exportName}`;
      const name = id.replace(/[^A-Za-z0-9_.-]/g, "_");
      if (Object.hasOwn(tools, name))
        throw new Error(`Duplicate MCP tool name: ${name}`);
      const { userId, ...args } = fn.args;
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
          if (fn.isQuery) return ctx.runQuery(reference<"query">(id), params);
          if (fn.isMutation)
            return ctx.runMutation(reference<"mutation">(id), params);
          return ctx.runAction(reference<"action">(id), params);
        },
      });
    }
  }
  return tools;
}
