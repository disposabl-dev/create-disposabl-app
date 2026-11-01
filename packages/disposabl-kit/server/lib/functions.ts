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
    return Object.assign(builder(definition), {
      platforms: definition.platforms,
      mcp: definition.mcp ?? definition.platforms?.mcp ?? false,
      args: definition.args,
      returns: definition.returns,
    });
  };
};

export const internalQuery = withPlatforms(nativeQuery);
export const internalMutation = withPlatforms(nativeMutation);
export const internalAction = withPlatforms(nativeAction);
