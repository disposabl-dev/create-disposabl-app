import {
  v,
  type GenericValidator,
  type PropertyValidators,
} from "convex/values";
import {
  internalAction as nativeAction,
  internalMutation as nativeMutation,
  internalQuery as nativeQuery,
} from "../../../backend/convex/_generated/server";
import type { Platforms } from "./platforms";

// Trusted server entrypoints must supply the user ID after authentication.
export const identityFields = {
  userId: v.string(),
};

const withPlatforms = <TDefinition, TResult extends object>(
  builder: (definition: TDefinition) => TResult,
) => {
  return (
    definition: TDefinition & {
      args: PropertyValidators;
      returns: GenericValidator;
      platforms?: Platforms;
      mcp?: boolean;
    },
  ): TResult => {
    const mcpEnabled =
      definition.platforms === undefined
        ? definition.mcp === true
        : definition.platforms === true ||
          (typeof definition.platforms === "object" &&
            definition.platforms.mcp === true);
    return Object.assign(builder(definition), {
      platforms: definition.platforms,
      mcp: mcpEnabled ? (definition.mcp ?? true) : false,
      args: definition.args,
      returns: definition.returns,
    });
  };
};

export const internalQuery = withPlatforms(nativeQuery);
export const internalMutation = withPlatforms(nativeMutation);
export const internalAction = withPlatforms(nativeAction);
